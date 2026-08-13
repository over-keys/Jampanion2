using System.Globalization;
using Jampanion.Core.Music;
using Jampanion.Web.Audio;
using Jampanion.Web.Models;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.JSInterop;

namespace Jampanion.Web.Pages;

public class IntegratedHomeLogic : ComponentBase, IAsyncDisposable
{
    private IJSObjectReference? _chartModule;
    private IJSObjectReference? _audioModule;
    private DotNetObjectReference<IntegratedHomeLogic>? _self;
    private CancellationTokenSource? _progressCancellation;
    private readonly SemaphoreSlim _planMutationGate = new(1, 1);
    private IntegratedSessionPlan? _sessionPlan;
    private JazzPlaybackFormDto? _compiledChart;
    private int _sessionSeed;
    private int _generationVersion;
    private double _positionSeconds;
    private double _launchPlanDurationSeconds;
    private int _lastHighlightedSource = -2;
    private int _lastHighlightedOccurrence = -2;
    private bool _endingInProgress;
    private string? _lastChartConnectionError;
    private bool _hasBootstrap;
    private int _savedTempoBpm = 120;
    private bool _savedTempoExplicit;
    private bool _savedTempoUserSet;
    private AccompanimentStyle _savedStyle = AccompanimentStyle.Swing;
    private int _savedSemitoneShift;
    private bool? _lastToolbarDirty;
    private bool? _lastToolbarRevertVisible;

    [Inject] public IJSRuntime JS { get; set; } = default!;

    protected string SelectedIdentity { get; set; } = string.Empty;
    protected string CurrentKey { get; set; } = "C";
    protected string CurrentMeter { get; set; } = "4/4";
    protected bool CurrentSongIsNative { get; set; }
    protected bool CurrentNativeHasOriginalSource { get; set; }
    protected bool CurrentSongHasSavedOverrides { get; set; }
    protected int TempoBpm { get; set; } = 120;
    protected bool TempoIsExplicit { get; set; }
    protected bool TempoIsUserSet { get; set; }
    protected int CurrentSemitoneShift { get; set; }
    protected AccompanimentStyle SelectedStyle { get; set; } = AccompanimentStyle.Swing;
    protected string StatusText { get; set; } = "Loading Jazz Chart Viewer";

    protected bool IsPlaying { get; set; }
    protected bool IsLoading { get; set; }
    protected bool ChartReady { get; set; }
    protected bool HeadOutQueued { get; set; }
    protected bool HeadOutActive { get; set; }
    protected bool SettingsOpen { get; set; }
    protected bool NewSongOpen { get; set; }

    protected bool PianoEnabled { get; set; } = true;
    protected bool BassEnabled { get; set; } = true;
    protected bool DrumsEnabled { get; set; } = true;
    protected bool MidiThruEnabled { get; set; }
    protected int PianoVolume { get; set; } = 100;
    protected int BassVolume { get; set; } = 100;
    protected int DrumsVolume { get; set; } = 100;
    protected int VibraphoneVolume { get; set; } = 100;

    protected IReadOnlyList<MidiDeviceChoice> MidiInputs { get; set; } = Array.Empty<MidiDeviceChoice>();
    protected IReadOnlyList<MidiDeviceChoice> MidiOutputs { get; set; } = Array.Empty<MidiDeviceChoice>();
    protected string SelectedMidiInputId { get; set; } = string.Empty;
    protected string SelectedMidiOutputId { get; set; } = string.Empty;
    protected bool MidiUnavailable { get; set; }
    protected string MidiStatusText { get; set; } = "Built-in Trio selected · MIDI devices have not been queried.";

    protected string NewSongTitle { get; set; } = "Untitled";
    protected int NewSongBars { get; set; } = 32;
    protected string NewSongMeter { get; set; } = "4/4";
    protected string NewSongKey { get; set; } = "C";
    protected string NewSongValidation { get; set; } = string.Empty;

    protected bool HasUnsavedChartChanges { get; private set; }
    protected bool HasUnsavedAccompanimentChanges =>
        TempoBpm != _savedTempoBpm ||
        TempoIsExplicit != _savedTempoExplicit ||
        TempoIsUserSet != _savedTempoUserSet ||
        SelectedStyle != _savedStyle ||
        CurrentSemitoneShift != _savedSemitoneShift;
    protected bool HasUnsavedChanges => HasUnsavedChartChanges || HasUnsavedAccompanimentChanges;
    protected bool CanRevertCurrentSong =>
        HasUnsavedAccompanimentChanges ||
        CurrentSongHasSavedOverrides ||
        (CurrentSongIsNative && CurrentNativeHasOriginalSource);


    protected IReadOnlyList<AccompanimentStyle> StyleChoices => CurrentMeter == "3/4"
        ? [AccompanimentStyle.JazzWaltz]
        : [AccompanimentStyle.Swing, AccompanimentStyle.JazzBallad, AccompanimentStyle.BossaNova, AccompanimentStyle.AfroCubanLatin];

    protected string PrimaryButtonText => IsLoading
        ? "Preparing…"
        : !IsPlaying ? "Start session" : HeadOutActive ? "Head Out" : HeadOutQueued ? "Head out queued" : "Back to head";

    protected string CurrentStage
    {
        get
        {
            if (!IsPlaying || _sessionPlan is null) return "Stopped";
            if (_positionSeconds < _sessionPlan.CountInSeconds) return "Count In";
            return _sessionPlan.Stages.LastOrDefault(stage => _positionSeconds >= stage.StartSeconds && _positionSeconds < stage.EndSeconds)?.Name
                ?? (_positionSeconds >= _sessionPlan.DurationSeconds ? "Complete" : "Playing");
        }
    }

    protected string PositionText => _sessionPlan is null
        ? "0:00"
        : $"{FormatTime(_positionSeconds)} / {FormatTime(_sessionPlan.DurationSeconds)}";

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            // The chart pane is independently usable. A transient bridge failure must
            // never permanently disable Session controls; Start Session retries the
            // bridge against the currently selected chart.
            if (await TryConnectChartAsync(reportFailure: false))
            {
                await RestoreMixerPreferencesAsync();
            }
            await InvokeAsync(StateHasChanged);
        }
        await SyncToolbarRevertAsync();
    }

    private async Task SyncToolbarRevertAsync()
    {
        if (!ChartReady || _chartModule is null) return;
        var dirty = HasUnsavedChanges;
        var visible = CanRevertCurrentSong;
        if (_lastToolbarDirty == dirty && _lastToolbarRevertVisible == visible) return;
        _lastToolbarDirty = dirty;
        _lastToolbarRevertVisible = visible;
        try
        {
            await _chartModule.InvokeVoidAsync("setToolbarState", dirty, visible);
        }
        catch
        {
            _lastToolbarDirty = null;
            _lastToolbarRevertVisible = null;
        }
    }

    private async Task<bool> TryConnectChartAsync(bool reportFailure)
    {
        try
        {
            _self ??= DotNetObjectReference.Create(this);
            _chartModule ??= await JS.InvokeAsync<IJSObjectReference>("import", "./js/jazz-chart-host.js?v=46");
            try { await _chartModule.InvokeVoidAsync("initializeMobileControlsScrollHint"); } catch { }
            var bootstrap = await _chartModule.InvokeAsync<JazzChartBootstrap>("initialize", "jcv-frame", _self);
            ApplyBootstrap(bootstrap);
            ChartReady = true;
            _lastChartConnectionError = null;
            StatusText = "Ready";
            return true;
        }
        catch (Exception exception)
        {
            ChartReady = false;
            _lastChartConnectionError = exception.Message;
            StatusText = reportFailure
                ? $"Could not connect accompaniment to the chart: {exception.Message}"
                : "Chart ready · accompaniment will connect when Start Session is pressed";
            return false;
        }
    }

    [JSInvokable]
    public async Task ChartBootstrapChanged(JazzChartBootstrap bootstrap)
    {
        var incomingIdentity = bootstrap.SelectedIdentity ?? string.Empty;
        if (IsPlaying && _hasBootstrap &&
            !string.Equals(SelectedIdentity, incomingIdentity, StringComparison.Ordinal))
        {
            StatusText = "Stop the session before changing songs";
            await InvokeAsync(StateHasChanged);
            return;
        }

        ApplyBootstrap(bootstrap);
        await InvokeAsync(StateHasChanged);
    }

    [JSInvokable]
    public async Task ChartEdited(string message)
    {
        HasUnsavedChartChanges = true;
        StatusText = message;
        await InvokeAsync(StateHasChanged);
    }

    [JSInvokable("SaveChartFromToolbar")]
    public async Task SaveChartFromToolbarAsync()
    {
        await SaveAccompanimentSettingsAsync();
        await InvokeAsync(StateHasChanged);
    }

    [JSInvokable("RevertChartFromToolbar")]
    public async Task RevertChartFromToolbarAsync()
    {
        await RevertCurrentSongAsync();
        await InvokeAsync(StateHasChanged);
    }

    [JSInvokable("NewSongFromToolbar")]
    public async Task NewSongFromToolbarAsync()
    {
        OpenNewSong();
        await InvokeAsync(StateHasChanged);
    }

    [JSInvokable]
    public async Task HandleSpaceShortcut()
    {
        if (SettingsOpen || NewSongOpen) return;
        await PrimarySessionActionAsync();
        await InvokeAsync(StateHasChanged);
    }

    private void ApplyBootstrap(JazzChartBootstrap bootstrap, bool forceAccompanimentSettings = false)
    {
        var incomingIdentity = bootstrap.SelectedIdentity ?? string.Empty;
        var identityChanged = forceAccompanimentSettings || !_hasBootstrap || !string.Equals(SelectedIdentity, incomingIdentity, StringComparison.Ordinal);
        var previousMeter = CurrentMeter;

        SelectedIdentity = incomingIdentity;
        CurrentKey = bootstrap.Key ?? "C";
        CurrentSemitoneShift = bootstrap.SemitoneShift;
        CurrentMeter = bootstrap.TimeSignature ?? "4/4";
        CurrentSongIsNative = bootstrap.IsNative;
        CurrentNativeHasOriginalSource = bootstrap.HasOriginalSource;
        CurrentSongHasSavedOverrides = bootstrap.HasSavedOverrides;

        // Tempo and accompaniment style belong to the accompaniment UI. The chart
        // bridge may emit bootstrap notifications for ordinary re-renders, key
        // changes, view-mode changes, or a reconnect. Those notifications must not
        // overwrite a tempo/style the user has just selected. Only load the stored/default accompaniment
        // controls when the selected song actually changes (or on first bootstrap).
        if (identityChanged)
        {
            if (!AccompanimentStyleNames.TryParseExplicit(bootstrap.AccompanimentStyle, out var incomingStyle))
            {
                incomingStyle = AccompanimentStyleNames.Parse(bootstrap.AccompanimentStyle, CurrentMeter);
            }
            SelectedStyle = CurrentMeter == "3/4"
                ? AccompanimentStyle.JazzWaltz
                : incomingStyle == AccompanimentStyle.JazzWaltz ? AccompanimentStyle.Swing : incomingStyle;
            TempoIsExplicit = bootstrap.TempoExplicit;
            TempoIsUserSet = bootstrap.TempoUserExplicit;
            TempoBpm = TempoIsExplicit
                ? Math.Clamp(bootstrap.TempoBpm, 40, 300)
                : DefaultTempoForStyle(SelectedStyle);
            CaptureAccompanimentSettingsBaseline();
            HasUnsavedChartChanges = false;
        }
        else if (!string.Equals(previousMeter, CurrentMeter, StringComparison.Ordinal))
        {
            if (CurrentMeter == "3/4") SelectedStyle = AccompanimentStyle.JazzWaltz;
            else if (SelectedStyle == AccompanimentStyle.JazzWaltz) SelectedStyle = AccompanimentStyle.Swing;
            if (!TempoIsExplicit) TempoBpm = DefaultTempoForStyle(SelectedStyle);
        }

        _hasBootstrap = true;
    }


    protected async Task ChangeTempoAsync(ChangeEventArgs args)
    {
        if (IsLoading) return;
        if (!int.TryParse(args.Value?.ToString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var requested)) return;
        requested = Math.Clamp(requested, 40, 300);
        if (requested == TempoBpm)
        {
            // Re-entering the value already shown is not a user-visible or
            // persisted change. In particular, do not turn an Auto/default
            // tempo into an explicit override merely because the input lost
            // and regained focus.
            return;
        }

        var previous = TempoBpm;
        var previousExplicit = TempoIsExplicit;
        var previousUserSet = TempoIsUserSet;
        TempoBpm = requested;
        TempoIsExplicit = true;
        TempoIsUserSet = true;
        if (IsPlaying)
        {
            await RebuildLiveTempoAsync(previous, previousExplicit, previousUserSet);
        }
    }

    protected async Task ChangeStyleAsync(ChangeEventArgs args)
    {
        if (IsLoading) return;
        if (!AccompanimentStyleNames.TryParseExplicit(args.Value?.ToString(), out var requested)) return;
        if (CurrentMeter == "3/4") requested = AccompanimentStyle.JazzWaltz;
        if (requested == SelectedStyle) return;
        var previousStyle = SelectedStyle;
        SelectedStyle = requested;
        if (IsPlaying)
        {
            await QueueStyleChangeAsync(previousStyle);
        }
    }

    private static int DefaultTempoForStyle(AccompanimentStyle style) => style switch
    {
        AccompanimentStyle.JazzBallad => 70,
        AccompanimentStyle.BossaNova => 140,
        AccompanimentStyle.JazzWaltz => 150,
        AccompanimentStyle.AfroCubanLatin => 180,
        _ => 120
    };

    private async Task SaveSongSettingsAsync()
    {
        if (_chartModule is null || string.IsNullOrWhiteSpace(SelectedIdentity)) return;
        await _chartModule.InvokeVoidAsync(
            "saveSongSettings",
            SelectedIdentity,
            TempoBpm,
            AccompanimentStyleNames.StorageName(SelectedStyle),
            TempoIsUserSet,
            CurrentSemitoneShift);
    }

    protected async Task PrimarySessionActionAsync()
    {
        if (!IsPlaying) await StartSessionAsync();
        else if (HeadOutActive) return;
        else if (!HeadOutQueued) await CueHeadOutAsync();
    }

    protected async Task StartSessionAsync()
    {
        if (IsPlaying || IsLoading) return;
        IsLoading = true;
        StatusText = ChartReady ? "Preparing chart" : "Connecting to chart";
        var generationVersion = ++_generationVersion;
        IJSObjectReference? startedAudio = null;
        var audioStarted = false;
        await InvokeAsync(StateHasChanged);
        try
        {
            // Read the chart at the moment playback is requested. This makes the
            // original Jazz Chart Viewer search/selection the source of truth and
            // also recovers from any bridge failure that occurred during startup.
            if (!await TryConnectChartAsync(reportFailure: true) || _chartModule is null)
            {
                throw new InvalidOperationException(_lastChartConnectionError ?? "The accompaniment bridge could not read the current Jazz Chart Viewer song.");
            }

            var bootstrap = await _chartModule.InvokeAsync<JazzChartBootstrap>("getState");
            if (generationVersion != _generationVersion) throw new OperationCanceledException();
            ApplyBootstrap(bootstrap);

            // Freeze the exact chart identity before compilation/audio preparation.
            // Otherwise the user could choose a different song during the loading
            // window and end up seeing a chart different from the prepared session.
            await _chartModule.InvokeVoidAsync("setPlaybackState", true, -1);

            var audio = await EnsureAudioModuleAsync();
            startedAudio = audio;
            await RestorePreferredOutputForPlaybackAsync(audio);
            var primeTask = audio.InvokeVoidAsync("primeAudio").AsTask();
            _compiledChart = await _chartModule.InvokeAsync<JazzPlaybackFormDto>("compilePlayback");
            if (generationVersion != _generationVersion) throw new OperationCanceledException();
            if (_compiledChart is null || !_compiledChart.IsSupportedForPlayback)
            {
                throw new InvalidOperationException(
                    "This chart can be displayed, but accompaniment currently requires a stable 3/4 or 4/4 playback form with at least four bars.");
            }

            await primeTask;
            if (generationVersion != _generationVersion) throw new OperationCanceledException();
            _sessionSeed = Random.Shared.Next();
            _sessionPlan = IntegratedSessionPlanner.BuildSession(
                _compiledChart,
                TempoBpm,
                SelectedStyle,
                _sessionSeed,
                generatedChoruses: 1,
                endWithHeadOut: false);
            _launchPlanDurationSeconds = _sessionPlan.DurationSeconds;
            _positionSeconds = 0;
            HeadOutQueued = false;
            HeadOutActive = false;
            await Task.Yield();
            if (generationVersion != _generationVersion) throw new OperationCanceledException();
            await audio.InvokeVoidAsync("startSession", _sessionPlan.Notes, MixerState());
            audioStarted = true;
            if (generationVersion != _generationVersion) throw new OperationCanceledException();
            IsPlaying = true;
            StatusText = "Playing";
            BeginProgressUpdates();
            _ = ExpandSessionAfterStartAsync(generationVersion);
        }
        catch (OperationCanceledException)
        {
            await RollbackStartAsync(startedAudio, audioStarted);
            StatusText = "Stopped";
        }
        catch (Exception exception)
        {
            await RollbackStartAsync(startedAudio, audioStarted);
            StatusText = $"Session could not start: {exception.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    private async Task RollbackStartAsync(IJSObjectReference? startedAudio, bool audioStarted)
    {
        if (audioStarted && startedAudio is not null)
        {
            try { await startedAudio.InvokeVoidAsync("stopSession"); } catch { }
        }
        if (_chartModule is not null)
        {
            try { await _chartModule.InvokeVoidAsync("setPlaybackState", false, -1); } catch { }
        }
        IsPlaying = false;
        HeadOutQueued = false;
        HeadOutActive = false;
        _sessionPlan = null;
        _compiledChart = null;
        _positionSeconds = 0;
        _launchPlanDurationSeconds = 0;
    }

    private async Task ExpandSessionAfterStartAsync(int generationVersion)
    {
        if (_compiledChart is null) return;
        var gateEntered = false;
        try
        {
            var browserYieldModule = _chartModule;
            async ValueTask YieldAsync()
            {
                if (browserYieldModule is not null)
                {
                    await Task.Delay(1);
                }
                if (!IsPlaying || HeadOutQueued || generationVersion != _generationVersion)
                    throw new OperationCanceledException();
            }

            var expanded = await IntegratedSessionPlanner.BuildSessionIncrementallyAsync(
                _compiledChart,
                TempoBpm,
                SelectedStyle,
                _sessionSeed,
                YieldAsync,
                endWithHeadOut: false);
            await _planMutationGate.WaitAsync();
            gateEntered = true;
            if (!IsPlaying || HeadOutQueued || generationVersion != _generationVersion || _audioModule is null) return;

            var continuation = expanded.Notes.Where(note => note.StartSeconds >= _launchPlanDurationSeconds - 0.001d).ToArray();
            await _audioModule.InvokeVoidAsync("appendSession", continuation, expanded.DurationSeconds);
            // Head Out can be queued while appendSession is crossing the JS
            // boundary. Never let this background expansion overwrite the
            // replacement plan that contains the HeadOut stage.
            if (!IsPlaying || HeadOutQueued || generationVersion != _generationVersion) return;
            _sessionPlan = expanded;
            _positionSeconds = await _audioModule.InvokeAsync<double>("getPosition");
            await InvokeAsync(StateHasChanged);
        }
        catch (OperationCanceledException) { }
        catch (Exception exception)
        {
            StatusText = $"Playback continues with the prepared section; full-session expansion failed: {exception.Message}";
            await InvokeAsync(StateHasChanged);
        }
        finally
        {
            if (gateEntered) _planMutationGate.Release();
        }
    }

    protected async Task CueHeadOutAsync()
    {
        if (!IsPlaying || _sessionPlan is null || _compiledChart is null || _audioModule is null || HeadOutQueued || _endingInProgress) return;
        _endingInProgress = true;
        var generationVersion = ++_generationVersion;
        var gateEntered = false;
        try
        {
            _positionSeconds = await _audioModule.InvokeAsync<double>("getPosition");
            var headOutChorus = IntegratedSessionPlanner.ResolveNextHeadOutChorus(_sessionPlan, _positionSeconds);
            StatusText = "Preparing head out";
            await InvokeAsync(StateHasChanged);

            async ValueTask YieldAsync()
            {
                await Task.Delay(1);
                if (!IsPlaying || generationVersion != _generationVersion) throw new OperationCanceledException();
            }

            var replacement = await IntegratedSessionPlanner.BuildSessionIncrementallyAsync(
                _compiledChart,
                TempoBpm,
                SelectedStyle,
                _sessionSeed,
                YieldAsync,
                headOutChorus: headOutChorus);
            if (!IsPlaying || generationVersion != _generationVersion || _audioModule is null) return;
            await _planMutationGate.WaitAsync();
            gateEntered = true;
            if (!IsPlaying || generationVersion != _generationVersion || _audioModule is null) return;
            var current = await _audioModule.InvokeAsync<double>("getPosition");
            await _audioModule.InvokeVoidAsync("replaceSession", replacement.Notes, replacement.DurationSeconds, current, false);
            _sessionPlan = replacement;
            _positionSeconds = current;
            HeadOutQueued = true;
            StatusText = "Head out queued";
        }
        catch (OperationCanceledException) { }
        catch (Exception exception)
        {
            StatusText = $"Head out could not be queued: {exception.Message}";
        }
        finally
        {
            if (gateEntered) _planMutationGate.Release();
            _endingInProgress = false;
        }
    }

    private async Task RebuildLiveTempoAsync(
        int previousTempo,
        bool previousTempoExplicit,
        bool previousTempoUserSet)
    {
        if (!IsPlaying || _compiledChart is null || _sessionPlan is null || _audioModule is null) return;
        var oldPlan = _sessionPlan;
        var generationVersion = ++_generationVersion;
        const double schedulingGuardSeconds = 0.30d;
        try
        {
            async ValueTask YieldAsync()
            {
                await Task.Delay(1);
                if (!IsPlaying || generationVersion != _generationVersion) throw new OperationCanceledException();
            }

            var currentPosition = await _audioModule.InvokeAsync<double>("getPosition");
            var boundaryBar = NextBarBoundary(oldPlan, currentPosition, schedulingGuardSeconds)
                ?? throw new InvalidOperationException("No later bar boundary is available in the prepared session.");
            var replacement = await IntegratedSessionPlanner.BuildSessionIncrementallyAsync(
                _compiledChart,
                TempoBpm,
                SelectedStyle,
                _sessionSeed,
                YieldAsync,
                headOutChorus: oldPlan.HeadOutChorus,
                endWithHeadOut: oldPlan.HeadOutChorus is not null);
            if (!IsPlaying || generationVersion != _generationVersion || _audioModule is null) return;

            currentPosition = await _audioModule.InvokeAsync<double>("getPosition");
            if (boundaryBar.StartSeconds - currentPosition <= schedulingGuardSeconds)
            {
                boundaryBar = NextBarBoundary(oldPlan, currentPosition, schedulingGuardSeconds)
                    ?? throw new InvalidOperationException("The requested tempo change reached the end of the prepared session.");
            }

            var replacementBoundary = replacement.PlaybackBars.FirstOrDefault(bar => bar.SequenceIndex == boundaryBar.SequenceIndex)
                ?? throw new InvalidOperationException("The replacement plan does not contain the requested bar boundary.");
            var delta = boundaryBar.StartSeconds - replacementBoundary.StartSeconds;
            var continuation = replacement.Notes
                .Where(note => note.StartSeconds >= replacementBoundary.StartSeconds - 0.001d)
                .Select(note => note with { StartSeconds = note.StartSeconds + delta })
                .ToArray();
            var duration = boundaryBar.StartSeconds + Math.Max(0d, replacement.DurationSeconds - replacementBoundary.StartSeconds);

            // Keep the current MIDI queue and let the old notes ring out. The
            // new tempo takes effect on the next bar, matching Jampanion's
            // boundary-based handoff without rebasing/stopping the AudioContext.
            await _audioModule.InvokeVoidAsync(
                "replaceContinuation",
                continuation,
                duration,
                boundaryBar.StartSeconds);
            _sessionPlan = SplicePlanAtBoundary(oldPlan, replacement, boundaryBar.SequenceIndex, boundaryBar.StartSeconds, replacementBoundary.StartSeconds);
            _positionSeconds = currentPosition;
            StatusText = $"Tempo {TempoBpm} BPM queued for the next bar boundary";
        }
        catch (OperationCanceledException) { }
        catch (Exception exception)
        {
            TempoBpm = previousTempo;
            TempoIsExplicit = previousTempoExplicit;
            TempoIsUserSet = previousTempoUserSet;
            StatusText = $"Tempo change failed: {exception.Message}";
        }
    }

    private async Task QueueStyleChangeAsync(AccompanimentStyle previousStyle)
    {
        if (!IsPlaying || _compiledChart is null || _sessionPlan is null || _audioModule is null || HeadOutQueued)
        {
            return;
        }

        var oldPlan = _sessionPlan;
        var generationVersion = ++_generationVersion;
        const double schedulingGuardSeconds = 0.30d;
        try
        {
            var currentPosition = await _audioModule.InvokeAsync<double>("getPosition");
            var boundaryBar = NextFourBarBoundary(oldPlan, currentPosition, schedulingGuardSeconds);
            if (boundaryBar is null)
            {
                throw new InvalidOperationException("No later four-bar boundary is available in the prepared session.");
            }

            StatusText = $"Preparing {AccompanimentStyleNames.DisplayName(SelectedStyle)} for the next 4-bar boundary";
            await InvokeAsync(StateHasChanged);

            async ValueTask YieldAsync()
            {
                await Task.Delay(1);
                if (!IsPlaying || generationVersion != _generationVersion || HeadOutQueued)
                    throw new OperationCanceledException();
            }

            var replacement = await IntegratedSessionPlanner.BuildSessionIncrementallyAsync(
                _compiledChart,
                TempoBpm,
                SelectedStyle,
                _sessionSeed,
                YieldAsync,
                headOutChorus: oldPlan.HeadOutChorus,
                endWithHeadOut: oldPlan.HeadOutChorus is not null);
            if (!IsPlaying || generationVersion != _generationVersion || _audioModule is null) return;

            currentPosition = await _audioModule.InvokeAsync<double>("getPosition");
            if (boundaryBar.StartSeconds - currentPosition <= schedulingGuardSeconds)
            {
                boundaryBar = NextFourBarBoundary(oldPlan, currentPosition, schedulingGuardSeconds);
                if (boundaryBar is null)
                    throw new InvalidOperationException("The requested style change reached the end of the prepared session.");
            }

            var replacementBoundary = replacement.PlaybackBars.FirstOrDefault(bar => bar.SequenceIndex == boundaryBar.SequenceIndex)
                ?? throw new InvalidOperationException("The replacement plan does not contain the requested four-bar boundary.");
            var delta = boundaryBar.StartSeconds - replacementBoundary.StartSeconds;
            var continuation = replacement.Notes
                .Where(note => note.StartSeconds >= replacementBoundary.StartSeconds - 0.001d)
                .Select(note => note with { StartSeconds = note.StartSeconds + delta })
                .ToArray();
            var duration = boundaryBar.StartSeconds + Math.Max(0d, replacement.DurationSeconds - replacementBoundary.StartSeconds);

            await _audioModule.InvokeVoidAsync(
                "replaceContinuation",
                continuation,
                duration,
                boundaryBar.StartSeconds);
            _sessionPlan = SplicePlanAtBoundary(oldPlan, replacement, boundaryBar.SequenceIndex, boundaryBar.StartSeconds, replacementBoundary.StartSeconds);
            StatusText = $"{AccompanimentStyleNames.DisplayName(SelectedStyle)} queued for the next 4-bar boundary";
        }
        catch (OperationCanceledException) { }
        catch (Exception exception)
        {
            SelectedStyle = previousStyle;
            StatusText = $"Style change failed: {exception.Message}";
        }
    }

    private static IntegratedPlaybackBar? NextBarBoundary(
        IntegratedSessionPlan plan,
        double currentPosition,
        double guardSeconds)
    {
        var known = plan.PlaybackBars
            .Where(bar => bar.StartSeconds - currentPosition > guardSeconds)
            .OrderBy(bar => bar.StartSeconds)
            .FirstOrDefault();
        if (known is not null) return known;

        var currentBar = plan.PlaybackBars
            .Where(bar => bar.StartSeconds <= currentPosition)
            .OrderByDescending(bar => bar.StartSeconds)
            .FirstOrDefault();
        var sequenceIndex = currentBar is null ? 0 : currentBar.SequenceIndex + 1;
        var start = plan.CountInSeconds + sequenceIndex * plan.BarDurationSeconds;
        if (start - currentPosition <= guardSeconds) sequenceIndex++;

        start = plan.CountInSeconds + sequenceIndex * plan.BarDurationSeconds;
        return new IntegratedPlaybackBar(
            sequenceIndex,
            SourceIndex: -1,
            SourceOccurrence: 0,
            Chorus: 0,
            Stage: string.Empty,
            StartSeconds: start,
            EndSeconds: start + plan.BarDurationSeconds);
    }

    private static IntegratedPlaybackBar? NextFourBarBoundary(
        IntegratedSessionPlan plan,
        double currentPosition,
        double guardSeconds)
    {
        var known = plan.PlaybackBars
            .Where(bar => bar.SequenceIndex > 0 && bar.SequenceIndex % SessionConstants.BarsPerSegment == 0)
            .Where(bar => bar.StartSeconds - currentPosition > guardSeconds)
            .OrderBy(bar => bar.StartSeconds)
            .FirstOrDefault();
        if (known is not null) return known;

        if (plan.CountInSeconds - currentPosition > guardSeconds)
        {
            return new IntegratedPlaybackBar(
                SequenceIndex: 0, SourceIndex: -1, SourceOccurrence: 0, Chorus: 1, Stage: "Opening",
                StartSeconds: plan.CountInSeconds, EndSeconds: plan.CountInSeconds + plan.BarDurationSeconds);
        }

        // During the first chorus the long plan may still be generating. The
        // current prepared plan has a uniform tempo, so the next four-bar grid
        // can be projected beyond its present tail and the replacement plan
        // will extend playback from that exact boundary.
        var currentBar = plan.PlaybackBars
            .Where(bar => bar.StartSeconds <= currentPosition)
            .OrderByDescending(bar => bar.StartSeconds)
            .FirstOrDefault();
        var sequenceIndex = currentBar is null
            ? 0
            : ((currentBar.SequenceIndex / SessionConstants.BarsPerSegment) + 1) * SessionConstants.BarsPerSegment;
        while (sequenceIndex > 0)
        {
            var start = plan.CountInSeconds + sequenceIndex * plan.BarDurationSeconds;
            if (start - currentPosition > guardSeconds)
            {
                return new IntegratedPlaybackBar(
                    sequenceIndex,
                    SourceIndex: -1,
                    SourceOccurrence: 0,
                    Chorus: 0,
                    Stage: string.Empty,
                    StartSeconds: start,
                    EndSeconds: start + plan.BarDurationSeconds);
            }
            sequenceIndex += SessionConstants.BarsPerSegment;
            if (sequenceIndex > IntegratedSessionPlanner.MaximumOpenEndedChoruses * 512) break;
        }
        return null;
    }

    private static IntegratedSessionPlan SplicePlanAtBoundary(
        IntegratedSessionPlan oldPlan,
        IntegratedSessionPlan replacement,
        int sequenceIndex,
        double oldBoundary,
        double newBoundary)
    {
        var delta = oldBoundary - newBoundary;
        var notes = oldPlan.Notes
            .Where(note => note.StartSeconds < oldBoundary)
            .Concat(replacement.Notes
                .Where(note => note.StartSeconds >= newBoundary - 0.001d)
                .Select(note => note with { StartSeconds = note.StartSeconds + delta }))
            .OrderBy(note => note.StartSeconds)
            .ThenBy(note => note.Channel)
            .ToArray();

        var prefixStages = oldPlan.Stages
            .Where(stage => stage.StartSeconds < oldBoundary)
            .Select(stage => stage.EndSeconds > oldBoundary ? stage with { EndSeconds = oldBoundary } : stage);
        var suffixStages = replacement.Stages
            .Where(stage => stage.EndSeconds > newBoundary)
            .Select(stage => stage with
            {
                StartSeconds = Math.Max(newBoundary, stage.StartSeconds) + delta,
                EndSeconds = stage.EndSeconds + delta
            });
        var stages = prefixStages.Concat(suffixStages).ToArray();

        var bars = oldPlan.PlaybackBars
            .Where(bar => bar.SequenceIndex < sequenceIndex)
            .Concat(replacement.PlaybackBars
                .Where(bar => bar.SequenceIndex >= sequenceIndex)
                .Select(bar => bar with
                {
                    StartSeconds = bar.StartSeconds + delta,
                    EndSeconds = bar.EndSeconds + delta
                }))
            .OrderBy(bar => bar.SequenceIndex)
            .ToArray();

        return new IntegratedSessionPlan(
            notes,
            stages,
            bars,
            oldPlan.CountInSeconds,
            replacement.BarDurationSeconds,
            oldBoundary + Math.Max(0d, replacement.DurationSeconds - newBoundary),
            replacement.HeadOutChorus);
    }

    protected async Task StopSessionAsync()
    {
        _generationVersion++;
        _progressCancellation?.Cancel();
        // stopSession sends all-notes-off/all-sound-off before clearing the queue.
        if (_audioModule is not null) await _audioModule.InvokeVoidAsync("stopSession");
        IsPlaying = false;
        IsLoading = false;
        HeadOutQueued = false;
        HeadOutActive = false;
        _positionSeconds = 0;
        _sessionPlan = null;
        _compiledChart = null;
        _launchPlanDurationSeconds = 0;
        _lastHighlightedSource = -2;
        _lastHighlightedOccurrence = -2;
        if (_chartModule is not null) await _chartModule.InvokeVoidAsync("setPlaybackState", false, -1);
        StatusText = "Stopped";
    }

    private void BeginProgressUpdates()
    {
        _progressCancellation?.Cancel();
        _progressCancellation?.Dispose();
        _progressCancellation = new CancellationTokenSource();
        _ = ProgressLoopAsync(_progressCancellation.Token);
    }

    private async Task ProgressLoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try { await Task.Delay(110, token); }
            catch (OperationCanceledException) { break; }
            if (!IsPlaying || _audioModule is null) continue;
            try
            {
                var position = await _audioModule.InvokeAsync<double>("getPosition");
                _positionSeconds = position;
                if (HeadOutQueued && _sessionPlan?.Stages.Any(stage =>
                    string.Equals(stage.Name, "HeadOut", StringComparison.Ordinal) &&
                    position >= stage.StartSeconds) == true)
                {
                    HeadOutQueued = false;
                    HeadOutActive = true;
                    StatusText = "Head Out";
                }

                // StopSessionAsync is also used by the automatic completion
                // path. Keep this check ahead of chart highlighting so a
                // transient viewer/interop error cannot prevent the session
                // from being finalized, and explicitly rerender after the
                // state is reset so the UI leaves Head Out automatically.
                if (_sessionPlan is not null && position >= _sessionPlan.DurationSeconds + 0.3d)
                {
                    await StopSessionAsync();
                    await InvokeAsync(StateHasChanged);
                    break;
                }

                await UpdateChartHighlightAsync();
                await InvokeAsync(StateHasChanged);
            }
            catch (JSDisconnectedException) { break; }
            catch { }
        }
    }


    private async Task UpdateChartHighlightAsync()
    {
        if (_sessionPlan is null || _chartModule is null) return;
        var bar = _sessionPlan.PlaybackBars.LastOrDefault(item =>
            _positionSeconds >= item.StartSeconds && _positionSeconds < item.EndSeconds);
        var source = bar?.SourceIndex ?? -1;
        var occurrence = bar?.SourceOccurrence ?? 0;
        if (source == _lastHighlightedSource && occurrence == _lastHighlightedOccurrence) return;
        _lastHighlightedSource = source;
        _lastHighlightedOccurrence = occurrence;
        await _chartModule.InvokeVoidAsync("highlightSourceBar", source, occurrence);
    }

    protected async Task ToggleSettingsAsync()
    {
        SettingsOpen = !SettingsOpen;
        if (SettingsOpen)
        {
            await RefreshMidiAsync();
        }
    }

    protected async Task RefreshMidiAsync()
    {
        try
        {
            // Do not import the large audio module on browsers such as iPhone
            // Safari, where Web MIDI is not available. Importing it solely to
            // populate Settings can turn a harmless capability gap into a
            // Blazor event error before the dialog has rendered.
            var webMidiAvailable = await JS.InvokeAsync<bool>(
                "eval",
                "typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'");
            if (!webMidiAvailable)
            {
                SetMidiUnavailableStatus();
                return;
            }

            var audio = await EnsureAudioModuleAsync();
            if (_chartModule is not null)
            {
                try
                {
                    var preferences = await _chartModule.InvokeAsync<MidiDevicePreferences>("getDevicePreferences");
                    SelectedMidiInputId = preferences.InputId ?? string.Empty;
                    SelectedMidiOutputId = preferences.OutputId ?? string.Empty;
                }
                catch { }
            }

            Exception? midiError = null;
            try { MidiInputs = await audio.InvokeAsync<MidiDeviceChoice[]>("getMidiInputs"); }
            catch (Exception exception) { MidiInputs = Array.Empty<MidiDeviceChoice>(); midiError = exception; }
            try { MidiOutputs = await audio.InvokeAsync<MidiDeviceChoice[]>("getMidiOutputs"); }
            catch (Exception exception) { MidiOutputs = Array.Empty<MidiDeviceChoice>(); midiError ??= exception; }

            if (midiError is not null)
            {
                SetMidiUnavailableStatus();
                return;
            }

            MidiUnavailable = false;
            if (!IsPlaying)
            {
                if (!string.IsNullOrWhiteSpace(SelectedMidiOutputId) && MidiOutputs.Any(device => device.Id == SelectedMidiOutputId))
                {
                    try { await audio.InvokeVoidAsync("selectMidiOutput", SelectedMidiOutputId); }
                    catch { SelectedMidiOutputId = string.Empty; }
                }
                else
                {
                    SelectedMidiOutputId = string.Empty;
                    await audio.InvokeVoidAsync("selectMidiOutput", "");
                }
            }

            if (!string.IsNullOrWhiteSpace(SelectedMidiInputId) && MidiInputs.Any(device => device.Id == SelectedMidiInputId))
            {
                try { await audio.InvokeVoidAsync("selectMidiInput", SelectedMidiInputId, (object?)null); }
                catch { SelectedMidiInputId = string.Empty; }
            }
            else
            {
                SelectedMidiInputId = string.Empty;
                try { await audio.InvokeVoidAsync("selectMidiInput", "", (object?)null); } catch { }
            }

            MidiStatusText = $"Built-in Trio available · {MidiInputs.Count} MIDI input(s), {MidiOutputs.Count} MIDI output(s)";
        }
        catch
        {
            // Settings is still useful on a device without Web MIDI. Keep all
            // browser/permission details out of the visible UI and, most
            // importantly, do not let a rejected MIDI promise break the page.
            SetMidiUnavailableStatus();
        }
    }

    private void SetMidiUnavailableStatus()
    {
        MidiInputs = Array.Empty<MidiDeviceChoice>();
        MidiOutputs = Array.Empty<MidiDeviceChoice>();
        SelectedMidiInputId = string.Empty;
        SelectedMidiOutputId = string.Empty;
        MidiUnavailable = true;
        MidiStatusText = "Built-in Trio available · Web MIDI unavailable on this device or browser.";
    }

    protected async Task SelectMidiInputAsync(ChangeEventArgs args)
    {
        if (IsLoading) return;
        SelectedMidiInputId = args.Value?.ToString() ?? string.Empty;
        try
        {
            var audio = await EnsureAudioModuleAsync();
            await audio.InvokeVoidAsync("selectMidiInput", SelectedMidiInputId, (object?)null);
            await SaveMidiPreferencesAsync();
            MidiStatusText = string.IsNullOrWhiteSpace(SelectedMidiInputId) ? "MIDI input closed · Built-in Trio available" : "MIDI input open";
        }
        catch (Exception exception) { MidiStatusText = $"MIDI input failed: {exception.Message}"; }
    }

    protected async Task SelectMidiOutputAsync(ChangeEventArgs args)
    {
        if (IsPlaying || IsLoading) return;
        var requested = args.Value?.ToString() ?? string.Empty;
        try
        {
            var audio = await EnsureAudioModuleAsync();
            await audio.InvokeVoidAsync("selectMidiOutput", requested);
            SelectedMidiOutputId = requested;
            await SaveMidiPreferencesAsync();
            MidiStatusText = string.IsNullOrWhiteSpace(requested) ? "Built-in Trio selected" : "External MIDI output selected";
        }
        catch (Exception exception) { MidiStatusText = $"MIDI output failed: {exception.Message}"; }
    }

    private async Task SaveMidiPreferencesAsync()
    {
        if (_chartModule is null) return;
        try { await _chartModule.InvokeVoidAsync("saveDevicePreferences", SelectedMidiInputId, SelectedMidiOutputId); }
        catch { }
    }

    protected async Task OnPianoEnabledChanged(bool value) { PianoEnabled = value; await PushMixerAsync(); }
    protected async Task OnBassEnabledChanged(bool value) { BassEnabled = value; await PushMixerAsync(); }
    protected async Task OnDrumsEnabledChanged(bool value) { DrumsEnabled = value; await PushMixerAsync(); }
    protected async Task OnMidiThruEnabledChanged(bool value)
    {
        MidiThruEnabled = value;
        if (value)
        {
            var audio = await EnsureAudioModuleAsync();
            await audio.InvokeVoidAsync("primeAudio");
            await RestorePreferredInputForMidiThruAsync(audio);
        }
        await PushMixerAsync();
    }
    protected async Task OnPianoVolumeChanged(int value) { PianoVolume = value; await PushMixerAsync(); }
    protected async Task OnBassVolumeChanged(int value) { BassVolume = value; await PushMixerAsync(); }
    protected async Task OnDrumsVolumeChanged(int value) { DrumsVolume = value; await PushMixerAsync(); }
    protected async Task OnVibraphoneVolumeChanged(int value) { VibraphoneVolume = value; await PushMixerAsync(); }

    private async Task RestorePreferredInputForMidiThruAsync(IJSObjectReference audio)
    {
        if (_chartModule is null || !string.IsNullOrWhiteSpace(SelectedMidiInputId)) return;
        try
        {
            var preferences = await _chartModule.InvokeAsync<MidiDevicePreferences>("getDevicePreferences");
            var preferredInput = preferences.InputId ?? string.Empty;
            if (string.IsNullOrWhiteSpace(preferredInput)) return;
            var inputs = await audio.InvokeAsync<MidiDeviceChoice[]>("getMidiInputs");
            if (!inputs.Any(device => device.Id == preferredInput))
            {
                MidiStatusText = "Saved MIDI input is unavailable · MIDI Thru has no input";
                return;
            }
            await audio.InvokeVoidAsync("selectMidiInput", preferredInput, (object?)null);
            SelectedMidiInputId = preferredInput;
        }
        catch (Exception exception)
        {
            MidiStatusText = $"MIDI input unavailable: {exception.Message}";
        }
    }

    private async Task RestorePreferredOutputForPlaybackAsync(IJSObjectReference audio)
    {
        if (_chartModule is null) return;
        try
        {
            var preferences = await _chartModule.InvokeAsync<MidiDevicePreferences>("getDevicePreferences");
            SelectedMidiInputId = preferences.InputId ?? string.Empty;
            SelectedMidiOutputId = preferences.OutputId ?? string.Empty;
            if (string.IsNullOrWhiteSpace(SelectedMidiOutputId))
            {
                await audio.InvokeVoidAsync("selectMidiOutput", "");
                return;
            }

            var outputs = await audio.InvokeAsync<MidiDeviceChoice[]>("getMidiOutputs");
            if (outputs.Any(device => device.Id == SelectedMidiOutputId))
            {
                await audio.InvokeVoidAsync("selectMidiOutput", SelectedMidiOutputId);
            }
            else
            {
                await audio.InvokeVoidAsync("selectMidiOutput", "");
                MidiStatusText = "Saved MIDI output is unavailable · Built-in Trio selected";
            }
        }
        catch (Exception exception)
        {
            try { await audio.InvokeVoidAsync("selectMidiOutput", ""); } catch { }
            SelectedMidiOutputId = string.Empty;
            MidiStatusText = $"Built-in Trio selected · MIDI output unavailable: {exception.Message}";
        }
    }

    private async Task PushMixerAsync()
    {
        if (_audioModule is not null) await _audioModule.InvokeVoidAsync("setMixer", MixerState());
        if (_chartModule is not null) await _chartModule.InvokeVoidAsync("saveMixerPreferences", MixerState());
    }

    private async Task RestoreMixerPreferencesAsync()
    {
        if (_chartModule is null) return;
        try
        {
            var preferences = await _chartModule.InvokeAsync<StoredMixerPreferences?>("getMixerPreferences");
            if (preferences is null) return;
            PianoEnabled = preferences.PianoEnabled;
            BassEnabled = preferences.BassEnabled;
            DrumsEnabled = preferences.DrumsEnabled;
            MidiThruEnabled = preferences.MidiThruEnabled;
            PianoVolume = Math.Clamp(preferences.PianoVolume, 0, 100);
            BassVolume = Math.Clamp(preferences.BassVolume, 0, 100);
            DrumsVolume = Math.Clamp(preferences.DrumsVolume, 0, 100);
            VibraphoneVolume = Math.Clamp(preferences.VibraphoneVolume, 0, 100);
        }
        catch
        {
            // The default mixer remains usable when browser storage is unavailable.
        }
    }

    protected async Task SaveChartAsync()
    {
        if (!HasUnsavedChartChanges || IsPlaying || IsLoading || _chartModule is null) return;
        try
        {
            var bootstrap = await _chartModule.InvokeAsync<JazzChartBootstrap>("saveCurrentChart");
            ApplyBootstrap(bootstrap);
            HasUnsavedChartChanges = false;
            StatusText = "Chart saved";
        }
        catch (Exception exception)
        {
            StatusText = $"Chart could not be saved: {exception.Message}";
        }
    }

    protected async Task SaveAccompanimentSettingsAsync()
    {
        if (IsPlaying || IsLoading || _chartModule is null) return;
        try
        {
            // Key changes are reported by the embedded Viewer asynchronously.
            // Refresh immediately before the dirty check so a fast Save cannot
            // persist the previous semitone shift.
            try
            {
                var current = await _chartModule.InvokeAsync<JazzChartBootstrap>("getState");
                ApplyBootstrap(current);
            }
            catch
            {
                // Keep the last bridge state if the refresh is transiently unavailable.
            }

            if (!HasUnsavedChanges || string.IsNullOrWhiteSpace(SelectedIdentity)) return;

            if (HasUnsavedChartChanges)
            {
                var bootstrap = await _chartModule.InvokeAsync<JazzChartBootstrap>("saveCurrentChart");
                ApplyBootstrap(bootstrap);
                HasUnsavedChartChanges = false;
            }

            if (HasUnsavedAccompanimentChanges)
            {
                await SaveSongSettingsAsync();
                CaptureAccompanimentSettingsBaseline();
                CurrentSongHasSavedOverrides = true;
            }

            StatusText = "Changes saved";
        }
        catch (Exception exception)
        {
            StatusText = $"Changes could not be saved: {exception.Message}";
        }
    }

    private void CaptureAccompanimentSettingsBaseline()
    {
        _savedTempoBpm = TempoBpm;
        _savedTempoExplicit = TempoIsExplicit;
        _savedTempoUserSet = TempoIsUserSet;
        _savedStyle = SelectedStyle;
        _savedSemitoneShift = CurrentSemitoneShift;
    }

    private IntegratedMixerState MixerState() => new(
        PianoEnabled, BassEnabled, DrumsEnabled, MidiThruEnabled,
        PianoVolume, BassVolume, DrumsVolume, VibraphoneVolume);

    protected void CloseNewSong() => NewSongOpen = false;

    protected void OpenNewSong()
    {
        if (IsPlaying || IsLoading) return;
        NewSongOpen = true;
        NewSongValidation = string.Empty;
        NewSongTitle = "Untitled";
        NewSongBars = 32;
        NewSongMeter = "4/4";
        NewSongKey = "C";
    }

    protected void UpdateNewSongTitle(ChangeEventArgs args) => NewSongTitle = args.Value?.ToString() ?? string.Empty;
    protected void UpdateNewSongBars(ChangeEventArgs args)
    {
        if (int.TryParse(args.Value?.ToString(), out var value)) NewSongBars = value;
    }
    protected void UpdateNewSongMeter(ChangeEventArgs args) => NewSongMeter = args.Value?.ToString() == "3/4" ? "3/4" : "4/4";
    protected void UpdateNewSongKey(ChangeEventArgs args) => NewSongKey = args.Value?.ToString() ?? "C";

    protected async Task CreateNewSongAsync()
    {
        if (IsPlaying || IsLoading || _chartModule is null) return;
        if (string.IsNullOrWhiteSpace(NewSongTitle)) { NewSongValidation = "Enter a title."; return; }
        if (NewSongBars is < 4 or > 512) { NewSongValidation = "Bars must be from 4 to 512."; return; }
        try
        {
            var bootstrap = await _chartModule.InvokeAsync<JazzChartBootstrap>(
                "createNewSong",
                NewSongTitle.Trim(),
                NewSongBars,
                NewSongMeter,
                NewSongKey,
                AccompanimentStyleNames.StorageName(NewSongMeter == "3/4" ? AccompanimentStyle.JazzWaltz : SelectedStyle));
            ApplyBootstrap(bootstrap);
            NewSongOpen = false;
            StatusText = "New song created";
        }
        catch (Exception exception) { NewSongValidation = exception.Message; }
    }

    protected async Task RevertCurrentSongAsync()
    {
        if (IsPlaying || IsLoading || !CanRevertCurrentSong || _chartModule is null) return;
        var bootstrap = await _chartModule.InvokeAsync<JazzChartBootstrap>("revertCurrentSong");
        ApplyBootstrap(bootstrap, forceAccompanimentSettings: true);
        StatusText = "Changes reverted";
    }

    protected async Task DeleteCurrentNativeSongAsync()
    {
        if (IsPlaying || IsLoading || !CurrentSongIsNative || CurrentNativeHasOriginalSource || _chartModule is null) return;
        var bootstrap = await _chartModule.InvokeAsync<JazzChartBootstrap>("deleteCurrentNativeSong");
        ApplyBootstrap(bootstrap);
        StatusText = "Native song deleted";
    }

    private async Task<IJSObjectReference> EnsureAudioModuleAsync() =>
        _audioModule ??= await JS.InvokeAsync<IJSObjectReference>("import", "./js/jampanion-audio.js?v=30");

    private static string FormatTime(double seconds)
    {
        var value = TimeSpan.FromSeconds(Math.Max(0, seconds));
        return $"{(int)value.TotalMinutes}:{value.Seconds:00}";
    }

    public async ValueTask DisposeAsync()
    {
        _generationVersion++;
        _progressCancellation?.Cancel();
        _progressCancellation?.Dispose();
        if (_chartModule is not null)
        {
            try { await _chartModule.InvokeVoidAsync("dispose"); await _chartModule.DisposeAsync(); }
            catch (JSDisconnectedException) { }
        }
        if (_audioModule is not null)
        {
            try { await _audioModule.InvokeVoidAsync("dispose"); await _audioModule.DisposeAsync(); }
            catch (JSDisconnectedException) { }
        }
        _self?.Dispose();
    }
}
