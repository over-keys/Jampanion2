namespace Jampanion.Core.Music;

public sealed record ChordChange
{
    public ChordChange(int startBeat, ChordSpec chord)
        : this((long)startBeat * SessionConstants.Ppq, chord)
    {
    }

    private ChordChange(long startTick, ChordSpec chord)
    {
        if (startTick is < 0 or >= (long)SessionConstants.MaximumSupportedBeatsPerBar * SessionConstants.Ppq)
        {
            throw new ArgumentOutOfRangeException(nameof(startTick));
        }

        ArgumentNullException.ThrowIfNull(chord);
        StartTick = startTick;
        Chord = chord;
    }

    /// <summary>
    /// Creates a chord change at an exact PPQ tick within the bar. This is the
    /// canonical position used by the integrated Jazz Chart Viewer playback path.
    /// Existing beat-based callers continue to use the public beat constructor.
    /// </summary>
    public static ChordChange AtTick(long startTick, ChordSpec chord) =>
        new(startTick, chord);

    public long StartTick { get; }

    /// <summary>
    /// Backward-compatible whole-beat view. Existing arrangement heuristics use
    /// this property, while exact harmony lookup uses StartTick.
    /// </summary>
    public int StartBeat => (int)(StartTick / SessionConstants.Ppq);

    public bool StartsOnBeat => StartTick % SessionConstants.Ppq == 0;

    public ChordSpec Chord { get; }
}
