using Jampanion.Core.Generation;
using Jampanion.Core.Music;
using Jampanion.Core.Playback;
using Jampanion.Web.Models;

namespace Jampanion.Web.Audio;

/// <summary>
/// Builds Jampanion accompaniment from the Jazz Chart Viewer playback compiler.
/// The chart engine owns form/navigation/timing; this class owns only musical
/// arrangement and note generation.
/// </summary>
public static class IntegratedSessionPlanner
{
    public const int MaximumOpenEndedChoruses = 12;

    public static IntegratedSessionPlan BuildSession(
        JazzPlaybackFormDto chart,
        int tempoBpm,
        AccompanimentStyle defaultStyle,
        int seed,
        int? headOutChorus = null,
        int? generatedChoruses = null,
        bool endWithHeadOut = true)
    {
        return BuildSessionCoreAsync(
            chart,
            tempoBpm,
            defaultStyle,
            seed,
            headOutChorus,
            generatedChoruses,
            endWithHeadOut,
            yieldToBrowser: null).GetAwaiter().GetResult();
    }

    public static Task<IntegratedSessionPlan> BuildSessionIncrementallyAsync(
        JazzPlaybackFormDto chart,
        int tempoBpm,
        AccompanimentStyle defaultStyle,
        int seed,
        Func<ValueTask> yieldToBrowser,
        int? headOutChorus = null,
        int? generatedChoruses = null,
        bool endWithHeadOut = true)
    {
        ArgumentNullException.ThrowIfNull(yieldToBrowser);
        return BuildSessionCoreAsync(
            chart,
            tempoBpm,
            defaultStyle,
            seed,
            headOutChorus,
            generatedChoruses,
            endWithHeadOut,
            yieldToBrowser);
    }

    public static int ResolveNextHeadOutChorus(IntegratedSessionPlan plan, double positionSeconds)
    {
        ArgumentNullException.ThrowIfNull(plan);
        if (positionSeconds < plan.CountInSeconds)
        {
            return 1;
        }

        var current = plan.Stages.LastOrDefault(stage => positionSeconds >= stage.StartSeconds);
        var chorus = current?.Chorus ?? 1;
        return Math.Clamp(chorus + 1, 1, MaximumOpenEndedChoruses);
    }

    private static async Task<IntegratedSessionPlan> BuildSessionCoreAsync(
        JazzPlaybackFormDto chart,
        int tempoBpm,
        AccompanimentStyle defaultStyle,
        int seed,
        int? headOutChorus,
        int? generatedChoruses,
        bool endWithHeadOut,
        Func<ValueTask>? yieldToBrowser)
    {
        ArgumentNullException.ThrowIfNull(chart);
        if (!chart.IsSupportedForPlayback)
        {
            throw new ArgumentException(
                "The chart cannot be played. Jampanion accompaniment currently supports stable 3/4 or 4/4 forms of at least four bars.",
                nameof(chart));
        }

        tempoBpm = Math.Clamp(tempoBpm, 40, 300);
        if (chart.TimeSignature == "3/4")
        {
            defaultStyle = AccompanimentStyle.JazzWaltz;
        }
        else if (defaultStyle == AccompanimentStyle.JazzWaltz)
        {
            defaultStyle = AccompanimentStyle.Swing;
        }

        var openingExactTune = CreateTune(chart, chart.OpeningBars, defaultStyle, tempoBpm, "opening");
        var soloExactTune = CreateTune(chart, chart.SoloBars, defaultStyle, tempoBpm, "solo");
        var headOutExactTune = CreateTune(chart, chart.HeadOutBars, defaultStyle, tempoBpm, "headout");
        // Existing generators contain beat-oriented arranging heuristics. Feeding a
        // 3& change to those heuristics as beat 3 would make the new harmony arrive
        // early. Project off-beat changes forward for the arranging heuristics, then
        // restore the exact written change below at its PPQ tick.
        var openingTune = CreateGeneratorProjection(openingExactTune);
        var soloTune = CreateGeneratorProjection(soloExactTune);
        var headOutTune = CreateGeneratorProjection(headOutExactTune);
        var beatsPerBar = soloExactTune.BeatsPerBar;
        var barTicks = soloExactTune.BarTicks;
        var secondsPerTick = 60d / tempoBpm / SessionConstants.Ppq;
        var countInTicks = SessionConstants.CountInBars * barTicks;

        var finalChorus = Math.Clamp(
            headOutChorus ?? generatedChoruses ?? MaximumOpenEndedChoruses,
            1,
            MaximumOpenEndedChoruses);
        int? resolvedHeadOutChorus = headOutChorus ?? (endWithHeadOut ? finalChorus : null);

        var notes = new List<IntegratedScheduledNote>();
        AddCountIn(notes, beatsPerBar, barTicks, secondsPerTick);
        var stages = new List<IntegratedStageBoundary>(finalChorus);
        var playbackBars = new List<IntegratedPlaybackBar>();
        var context = ArrangementContext.Initial;
        long sessionTicks = countInTicks;
        var sequenceIndex = 0;
        var headOutRendered = false;

        for (var chorus = 1; chorus <= finalChorus; chorus++)
        {
            var isHeadOut = resolvedHeadOutChorus == chorus;
            var stage = ResolveStage(chorus, isHeadOut);
            var sourceBars = isHeadOut
                ? chart.HeadOutBars
                : chorus == 1
                    ? chart.OpeningBars
                    : chart.SoloBars;
            var tune = isHeadOut ? headOutTune : chorus == 1 ? openingTune : soloTune;
            var exactTune = isHeadOut ? headOutExactTune : chorus == 1 ? openingExactTune : soloExactTune;
            var stageStartTicks = sessionTicks;

            var sourceOccurrences = new Dictionary<int, int>();
            for (var barIndex = 0; barIndex < sourceBars.Count; barIndex++)
            {
                var sourceIndex = sourceBars[barIndex].SourceIndex;
                var occurrence = sourceOccurrences.TryGetValue(sourceIndex, out var seen) ? seen : 0;
                sourceOccurrences[sourceIndex] = occurrence + 1;
                var start = (sessionTicks + (long)barIndex * barTicks) * secondsPerTick;
                playbackBars.Add(new IntegratedPlaybackBar(
                    sequenceIndex++,
                    sourceIndex,
                    occurrence,
                    chorus,
                    stage.Name,
                    start,
                    start + barTicks * secondsPerTick));
            }

            for (var segmentIndex = 0; segmentIndex < tune.SegmentCount; segmentIndex++)
            {
                if (yieldToBrowser is not null)
                {
                    await yieldToBrowser();
                }

                var segment = Stage3SessionPlanBuilder.BuildSegment(
                    tune,
                    segmentIndex,
                    stage.Feel,
                    chorus,
                    context,
                    sessionSeed: seed + chorus * 1009,
                    performanceGuidance: null,
                    isHeadOut: stage.IsHeadOut,
                    tempoBpm: tempoBpm);

                var exactNotes = ApplySubBeatHarmonyCorrections(
                    segment.Segment.Notes, exactTune, segmentIndex, stage);
                foreach (var note in exactNotes)
                {
                    var absoluteStart = sessionTicks + note.StartTick;
                    notes.Add(new IntegratedScheduledNote(
                        StartSeconds: absoluteStart * secondsPerTick,
                        DurationSeconds: Math.Max(0.01d, note.DurationTicks * secondsPerTick),
                        NoteNumber: note.NoteNumber,
                        Velocity: note.Velocity,
                        Channel: note.Channel));
                }

                context = segment.OutputContext;
                sessionTicks += segment.Segment.LengthTicks;
            }

            stages.Add(new IntegratedStageBoundary(
                stage.Name,
                chorus,
                stageStartTicks * secondsPerTick,
                sessionTicks * secondsPerTick));

            if (isHeadOut)
            {
                headOutRendered = true;
                break;
            }
        }

        if (headOutRendered)
        {
            // Jampanion's native ending is a separate one-bar plan: the bass
            // holds the tonic/root and the piano/drums resolve around it. The
            // chart viewer's HeadOut bars describe the written route, but do
            // not replace this final tonic hold.
            var endingPlan = EndingPlanBuilder.Build(
                headOutExactTune.TonicChord,
                defaultStyle,
                beatsPerBar);
            var endingStartTicks = sessionTicks;
            foreach (var note in endingPlan.Notes)
            {
                var absoluteStart = endingStartTicks + note.StartTick;
                notes.Add(new IntegratedScheduledNote(
                    StartSeconds: absoluteStart * secondsPerTick,
                    DurationSeconds: Math.Max(0.01d, note.DurationTicks * secondsPerTick),
                    NoteNumber: note.NoteNumber,
                    Velocity: note.Velocity,
                    Channel: note.Channel));
            }

            sessionTicks += endingPlan.LengthTicks;
            stages.Add(new IntegratedStageBoundary(
                "Ending / final tonic",
                resolvedHeadOutChorus ?? finalChorus,
                endingStartTicks * secondsPerTick,
                sessionTicks * secondsPerTick));
        }

        return new IntegratedSessionPlan(
            notes.OrderBy(note => note.StartSeconds).ThenBy(note => note.Channel).ToArray(),
            stages,
            playbackBars,
            CountInSeconds: countInTicks * secondsPerTick,
            BarDurationSeconds: barTicks * secondsPerTick,
            DurationSeconds: sessionTicks * secondsPerTick,
            HeadOutChorus: headOutChorus);
    }

    private static TuneForm CreateGeneratorProjection(TuneForm exactTune)
    {
        var projectedBars = exactTune.Bars.Select(bar =>
        {
            var projected = new List<ChordChange>(bar.ChordChanges.Count);
            foreach (var change in bar.ChordChanges.OrderBy(change => change.StartTick))
            {
                if (change.StartTick % SessionConstants.Ppq == 0)
                {
                    projected.Add(ChordChange.AtTick(change.StartTick, change.Chord));
                    continue;
                }

                var nextBeatTick = ((change.StartTick + SessionConstants.Ppq - 1) / SessionConstants.Ppq) * SessionConstants.Ppq;
                if (nextBeatTick < bar.BarTicks)
                {
                    projected.Add(ChordChange.AtTick(nextBeatTick, change.Chord));
                }
                // An &4 anticipation naturally resolves into the following bar.
                // The exact off-beat event is restored by ApplySubBeatHarmonyCorrections.
            }

            var deduplicated = projected
                .OrderBy(change => change.StartTick)
                .GroupBy(change => change.StartTick)
                .Select(group => group.Last())
                .ToArray();
            return new TuneBar(bar.Index, bar.Section, bar.BeatsPerBar, deduplicated);
        }).ToArray();

        return new TuneForm(
            exactTune.Id,
            exactTune.Title,
            exactTune.Key,
            projectedBars,
            exactTune.DefaultTempoBpm,
            endingFormBars: null,
            style: exactTune.OriginalStyle,
            timeSignature: exactTune.TimeSignature,
            codaStartIndex: null,
            sectionStyles: exactTune.SectionStyles);
    }

    private static IReadOnlyList<ScheduledNote> ApplySubBeatHarmonyCorrections(
        IReadOnlyList<ScheduledNote> generated,
        TuneForm exactTune,
        int segmentIndex,
        StageSpec stage)
    {
        var notes = generated.ToList();
        var firstBar = segmentIndex * SessionConstants.BarsPerSegment;
        var segmentBarCount = Math.Min(SessionConstants.BarsPerSegment, exactTune.Bars.Count - firstBar);
        if (segmentBarCount <= 0) return notes;

        for (var localBar = 0; localBar < segmentBarCount; localBar++)
        {
            var bar = exactTune.Bars[firstBar + localBar];
            var barOffset = (long)localBar * exactTune.BarTicks;
            var offBeatChanges = bar.ChordChanges
                .Where(change => change.StartTick > 0 && change.StartTick % SessionConstants.Ppq != 0)
                .OrderBy(change => change.StartTick)
                .ToArray();

            for (var index = 0; index < offBeatChanges.Length; index++)
            {
                var change = offBeatChanges[index];
                var exactTick = barOffset + change.StartTick;
                var nextLocalTick = bar.ChordChanges
                    .Where(candidate => candidate.StartTick > change.StartTick)
                    .Select(candidate => candidate.StartTick)
                    .DefaultIfEmpty(bar.BarTicks)
                    .Min();
                var available = Math.Max(36L, nextLocalTick - change.StartTick - 18L);
                var duration = Math.Min(420L, available);

                // No prior piano/bass harmony may ring across the exact written
                // change. This is essential for patterns such as 3, 3&, 4, 4&.
                TruncateHarmonyAtTick(notes, exactTick);
                CorrectOrInsertBass(notes, exactTick, duration, change.Chord, stage);
                CorrectOrInsertPiano(notes, exactTick, duration, change.Chord, stage);
            }
        }

        return notes
            .OrderBy(note => note.StartTick)
            .ThenBy(note => note.Channel)
            .ThenBy(note => note.NoteNumber)
            .ToArray();
    }

    private static void TruncateHarmonyAtTick(List<ScheduledNote> notes, long exactTick)
    {
        for (var index = 0; index < notes.Count; index++)
        {
            var note = notes[index];
            if (note.Channel is not (SessionConstants.PianoChannel or SessionConstants.BassChannel))
            {
                continue;
            }
            if (note.StartTick >= exactTick || note.StartTick + note.DurationTicks <= exactTick)
            {
                continue;
            }
            notes[index] = note with { DurationTicks = Math.Max(18L, exactTick - note.StartTick - 6L) };
        }
    }

    private static void CorrectOrInsertBass(
        List<ScheduledNote> notes,
        long exactTick,
        long duration,
        ChordSpec chord,
        StageSpec stage)
    {
        const long tolerance = 72;
        var candidateIndex = notes.FindIndex(note =>
            note.Channel == SessionConstants.BassChannel &&
            note.StartTick >= exactTick - 18 && note.StartTick <= exactTick + tolerance);
        if (candidateIndex >= 0)
        {
            var existing = notes[candidateIndex];
            notes[candidateIndex] = existing with
            {
                StartTick = exactTick,
                DurationTicks = Math.Max(100L, Math.Min(existing.DurationTicks, duration)),
                NoteNumber = ClosestRegisterNote(existing.NoteNumber, chord.BassFoundationPitchClass, 28, 55)
            };
            return;
        }

        var velocity = (byte)(stage.IsHeadOut ? 66 : stage.Name == "Opening" ? 64 : stage.Name == "Peak" ? 73 : 69);
        notes.Add(new ScheduledNote(
            exactTick,
            duration,
            ClosestRegisterNote(chord.BassRoot, chord.BassFoundationPitchClass, 28, 55),
            velocity,
            SessionConstants.BassChannel));
    }

    private static void CorrectOrInsertPiano(
        List<ScheduledNote> notes,
        long exactTick,
        long duration,
        ChordSpec chord,
        StageSpec stage)
    {
        const long tolerance = 72;
        var nearby = notes
            .Select((note, index) => (note, index))
            .Where(item => item.note.Channel == SessionConstants.PianoChannel &&
                item.note.StartTick >= exactTick - 18 && item.note.StartTick <= exactTick + tolerance)
            .ToArray();
        var velocity = nearby.Length > 0
            ? nearby.Max(item => item.note.Velocity)
            : (byte)(stage.IsHeadOut ? 49 : stage.Name == "Opening" ? 47 : stage.Name == "Peak" ? 57 : 53);
        var requestedDuration = nearby.Length > 0
            ? Math.Max(100L, Math.Min(nearby.Max(item => item.note.DurationTicks), duration))
            : duration;

        for (var index = nearby.Length - 1; index >= 0; index--)
        {
            notes.RemoveAt(nearby[index].index);
        }

        var voicing = chord.PianoVoicing.Count > 0
            ? chord.PianoVoicing.Take(4).ToArray()
            : new byte[] { 60 };
        foreach (var noteNumber in voicing)
        {
            notes.Add(new ScheduledNote(
                exactTick,
                requestedDuration,
                noteNumber,
                velocity,
                SessionConstants.PianoChannel));
        }
    }

    private static byte ClosestRegisterNote(byte reference, int pitchClass, int minimum, int maximum)
    {
        var candidates = Enumerable.Range(minimum, maximum - minimum + 1)
            .Where(note => ((note % 12) + 12) % 12 == ((pitchClass % 12) + 12) % 12)
            .OrderBy(note => Math.Abs(note - reference))
            .ToArray();
        return candidates.Length == 0 ? reference : (byte)candidates[0];
    }

    private static TuneForm CreateTune(
        JazzPlaybackFormDto chart,
        IReadOnlyList<JazzPlaybackBarDto> sourceBars,
        AccompanimentStyle defaultStyle,
        int tempoBpm,
        string suffix)
    {
        var timeSignature = chart.TimeSignature;
        var beatsPerBar = timeSignature == "3/4" ? 3 : 4;
        var barTicks = SessionConstants.GetBarTicks(beatsPerBar);
        var sectionStyles = new Dictionary<string, AccompanimentStyle>(StringComparer.OrdinalIgnoreCase);
        var bars = new List<TuneBar>(sourceBars.Count);
        string? previousStyleKey = null;
        var styleRange = -1;

        for (var index = 0; index < sourceBars.Count; index++)
        {
            var source = sourceBars[index];
            if (!string.Equals(source.TimeSignature, timeSignature, StringComparison.Ordinal))
            {
                throw new ArgumentException("Mixed meter charts can be displayed, but accompaniment for meter changes is not enabled yet.");
            }

            var effectiveStyle = ParseStyle(source.StyleOverride, defaultStyle, beatsPerBar);
            var styleKey = AccompanimentStyleNames.StorageName(effectiveStyle);
            var rehearsalBoundary = !string.IsNullOrWhiteSpace(source.Section);
            if (styleRange < 0 || rehearsalBoundary || !string.Equals(styleKey, previousStyleKey, StringComparison.Ordinal))
            {
                styleRange++;
            }
            previousStyleKey = styleKey;
            var section = $"__jcv_{styleRange}";
            sectionStyles[section] = effectiveStyle;

            if (source.Chords.Count == 0 || source.Chords[0].StartTick != 0)
            {
                throw new ArgumentException($"Bar {source.SourceIndex + 1} has no harmony at beat 1.");
            }

            var changes = source.Chords
                .OrderBy(change => change.StartTick)
                .Select(change =>
                {
                    if (change.StartTick < 0 || change.StartTick >= barTicks)
                    {
                        throw new ArgumentException($"A chord in bar {source.SourceIndex + 1} lies outside the measure.");
                    }

                    var symbol = NormalizeChordSymbol(change.Symbol);
                    if (chart.SemitoneShift != 0)
                    {
                        symbol = TuneTransposer.TransposeChordSymbol(symbol, chart.SemitoneShift, chart.PreferFlats);
                    }
                    var chord = ChordSymbolParser.Parse(symbol);
                    return ChordChange.AtTick(change.StartTick, chord);
                })
                .GroupBy(change => change.StartTick)
                .Select(group => group.Last())
                .ToArray();

            bars.Add(new TuneBar(index, section, beatsPerBar, changes));
        }

        var key = NormalizeKey(chart.DisplayedKey);
        return new TuneForm(
            id: $"jcv-{suffix}",
            title: chart.Title,
            key: key,
            bars: bars,
            defaultTempoBpm: tempoBpm,
            endingFormBars: null,
            style: AccompanimentStyleNames.DisplayName(defaultStyle),
            timeSignature: timeSignature,
            codaStartIndex: null,
            sectionStyles: sectionStyles);
    }

    private static AccompanimentStyle ParseStyle(string? value, AccompanimentStyle fallback, int beatsPerBar)
    {
        if (beatsPerBar == 3)
        {
            return AccompanimentStyle.JazzWaltz;
        }
        if (!string.IsNullOrWhiteSpace(value) && AccompanimentStyleNames.TryParseExplicit(value, out var parsed))
        {
            return parsed == AccompanimentStyle.JazzWaltz ? fallback : parsed;
        }
        return fallback == AccompanimentStyle.JazzWaltz ? AccompanimentStyle.Swing : fallback;
    }

    private static string NormalizeChordSymbol(string symbol)
    {
        var value = (symbol ?? string.Empty).Trim()
            .Replace('♯', '#')
            .Replace('♭', 'b')
            .Replace('−', '-');
        return value is "N.C" or "NC" ? "N.C." : value;
    }

    private static string NormalizeKey(string key) =>
        (key ?? string.Empty).Trim()
            .Replace('♯', '#')
            .Replace('♭', 'b')
            .Replace("min", "m", StringComparison.OrdinalIgnoreCase)
            .Replace("−", "m", StringComparison.Ordinal);

    private static StageSpec ResolveStage(int chorus, bool isHeadOut)
    {
        if (isHeadOut)
        {
            return new StageSpec("HeadOut", RhythmFeel.TwoBeat, true);
        }
        return chorus switch
        {
            1 => new StageSpec("Opening", RhythmFeel.TwoBeat, false),
            2 => new StageSpec("Groove", RhythmFeel.TwoBeat, false),
            3 => new StageSpec("Developing", RhythmFeel.FourBeat, false),
            _ => new StageSpec("Peak", RhythmFeel.FourBeat, false)
        };
    }

    private static void AddCountIn(
        List<IntegratedScheduledNote> notes,
        int beatsPerBar,
        long barTicks,
        double secondsPerTick)
    {
        for (var bar = 0; bar < SessionConstants.CountInBars; bar++)
        {
            for (var beat = 0; beat < beatsPerBar; beat++)
            {
                // Match Jampanion's count-in: the first 4/4 bar is a light
                // 1-and-3 pickup, while waltz is counted straight through as
                // | 1 2 3 | 1 2 3 |.
                if (beatsPerBar == 4 && bar == 0 && beat % 2 != 0)
                {
                    continue;
                }
                var tick = bar * barTicks + beat * SessionConstants.Ppq;
                var finalBar = bar == SessionConstants.CountInBars - 1;
                var velocity = beat == 0 ? finalBar ? (byte)76 : (byte)68 : (byte)54;
                notes.Add(new IntegratedScheduledNote(
                    tick * secondsPerTick,
                    0.08d,
                    37,
                    velocity,
                    SessionConstants.DrumsChannel));
            }
        }
    }

    private sealed record StageSpec(string Name, RhythmFeel Feel, bool IsHeadOut);
}
