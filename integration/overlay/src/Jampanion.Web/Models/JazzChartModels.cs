using Jampanion.Core.Music;

namespace Jampanion.Web.Models;

public sealed record JazzSongSummary(
    string Id,
    string Identity,
    string Title,
    string Composer,
    string OriginalStyle,
    string Key,
    string TimeSignature,
    int TempoBpm,
    bool TempoExplicit,
    bool TempoUserExplicit,
    string AccompanimentStyle,
    bool IsNative,
    bool HasOriginalSource);

public sealed record JazzChartBootstrap(
    IReadOnlyList<JazzSongSummary> Songs,
    string SelectedId,
    string SelectedIdentity,
    string Title,
    string Composer,
    string Key,
    string TimeSignature,
    int TempoBpm,
    bool TempoExplicit,
    bool TempoUserExplicit,
    string AccompanimentStyle,
    bool IsNative,
    bool HasOriginalSource,
    string ViewMode);

public sealed record JazzChordEventDto(
    long StartTick,
    string Symbol);

public sealed record JazzPlaybackBarDto(
    int SourceIndex,
    string TimeSignature,
    string Section,
    string? StyleOverride,
    IReadOnlyList<JazzChordEventDto> Chords);

public sealed record JazzPlaybackFormDto(
    string Title,
    string OriginalKey,
    string DisplayedKey,
    string TimeSignature,
    int SemitoneShift,
    bool PreferFlats,
    IReadOnlyList<JazzPlaybackBarDto> OpeningBars,
    IReadOnlyList<JazzPlaybackBarDto> SoloBars,
    IReadOnlyList<JazzPlaybackBarDto> HeadOutBars)
{
    public bool IsSupportedForPlayback =>
        TimeSignature is "3/4" or "4/4" &&
        OpeningBars.Count >= SessionConstants.BarsPerSegment &&
        SoloBars.Count >= SessionConstants.BarsPerSegment &&
        HeadOutBars.Count >= SessionConstants.BarsPerSegment;
}

public sealed record IntegratedScheduledNote(
    double StartSeconds,
    double DurationSeconds,
    byte NoteNumber,
    byte Velocity,
    byte Channel);

public sealed record IntegratedStageBoundary(
    string Name,
    int Chorus,
    double StartSeconds,
    double EndSeconds);

public sealed record IntegratedPlaybackBar(
    int SequenceIndex,
    int SourceIndex,
    int SourceOccurrence,
    int Chorus,
    string Stage,
    double StartSeconds,
    double EndSeconds);

public sealed record IntegratedSessionPlan(
    IReadOnlyList<IntegratedScheduledNote> Notes,
    IReadOnlyList<IntegratedStageBoundary> Stages,
    IReadOnlyList<IntegratedPlaybackBar> PlaybackBars,
    double CountInSeconds,
    double BarDurationSeconds,
    double DurationSeconds,
    int? HeadOutChorus);

public sealed record IntegratedMixerState(
    bool PianoEnabled,
    bool BassEnabled,
    bool DrumsEnabled,
    bool MidiThruEnabled,
    int PianoVolume,
    int BassVolume,
    int DrumsVolume,
    int VibraphoneVolume);

public sealed record StoredMixerPreferences(
    bool PianoEnabled,
    bool BassEnabled,
    bool DrumsEnabled,
    bool MidiThruEnabled,
    int PianoVolume,
    int BassVolume,
    int DrumsVolume,
    int VibraphoneVolume);

public sealed record MidiDeviceChoice(string Id, string Name);

public sealed record MidiDevicePreferences(string InputId, string OutputId);
