using System.Reflection;
using Jampanion.Web.Models;
using Jampanion.Web.Pages;
using Microsoft.JSInterop;

var bootstrap = new JazzChartBootstrap([], "song", "identity", "Title", "", "C", "4/4", 120,
    false, false, "Swing", true, true, false, "original", 0);
var module = new ChartModule(bootstrap);
var home = new ReviewHome(bootstrap, module);
home.EditDraft();
await home.Revert();
Check(home.Dirty && home.ChartDirty && home.Tempo == 160 && home.Transpose == 3,
    "Cancel must retain chart edits, tempo and transpose");
Console.WriteLine("PASS canceled Revert retains all draft state");

module.RevertConfirmed = true;
await home.Revert();
Check(!home.Dirty && home.Tempo == 120 && home.Transpose == 0,
    "Confirmed Revert must restore settings and clear draft state");
Console.WriteLine("PASS confirmed Revert restores the saved baseline");

home.EditDraft();
module.FailChartSave = true;
await home.Save();
Check(home.Dirty && home.ChartDirty && home.Error is not null, "Failed chart Save must remain dirty with a visible error");
module.FailChartSave = false;
module.FailSettingsSave = true;
await home.Save();
Check(home.Dirty && !home.ChartDirty && home.Error is not null, "Failed settings Save must retain its unsaved baseline");
module.FailSettingsSave = false;
await home.Save();
Check(!home.Dirty && home.Error is null, "Retry must save the same draft and clear the error");
Console.WriteLine("PASS chart/settings Save failures stay dirty and can be retried");

static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

sealed class ReviewHome : HomeLogic
{
    public ReviewHome(JazzChartBootstrap bootstrap, IJSObjectReference module)
    {
        typeof(HomeLogic).GetMethod("ApplyBootstrap", BindingFlags.Instance | BindingFlags.NonPublic)!
            .Invoke(this, [bootstrap, false]);
        typeof(HomeLogic).GetField("_chartModule", BindingFlags.Instance | BindingFlags.NonPublic)!
            .SetValue(this, module);
    }
    public bool Dirty => HasUnsavedChanges;
    public bool ChartDirty => HasUnsavedChartChanges;
    public int Tempo => TempoBpm;
    public int Transpose => CurrentSemitoneShift;
    public string? Error => ChartActionErrorText;
    public void EditDraft()
    {
        TempoBpm = 160;
        TempoIsExplicit = TempoIsUserSet = true;
        CurrentSemitoneShift = 3;
        typeof(HomeLogic).GetProperty("HasUnsavedChartChanges", BindingFlags.Instance | BindingFlags.NonPublic)!
            .SetValue(this, true);
    }
    public Task Revert() => RevertCurrentSongAsync();
    public Task Save() => SaveAccompanimentSettingsAsync();
}

sealed class ChartModule(JazzChartBootstrap bootstrap) : IJSObjectReference
{
    public bool RevertConfirmed { get; set; }
    public bool FailChartSave { get; set; }
    public bool FailSettingsSave { get; set; }
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    public ValueTask<TValue> InvokeAsync<TValue>(string identifier, object?[]? args) =>
        InvokeAsync<TValue>(identifier, CancellationToken.None, args);
    public ValueTask<TValue> InvokeAsync<TValue>(string identifier, CancellationToken cancellationToken, object?[]? args)
    {
        if ((identifier == "saveCurrentChart" && FailChartSave) || (identifier == "saveSongSettings" && FailSettingsSave))
            return ValueTask.FromException<TValue>(new JSException("Browser storage is full."));
        object? result = identifier switch
        {
            "getState" => bootstrap with { SemitoneShift = 3 },
            "saveCurrentChart" => bootstrap with { SemitoneShift = 3 },
            "revertCurrentSong" => new JazzChartActionResult(RevertConfirmed, bootstrap),
            "saveSongSettings" => default(TValue),
            _ => throw new InvalidOperationException($"Unexpected interop: {identifier}")
        };
        return ValueTask.FromResult((TValue)result!);
    }
}
