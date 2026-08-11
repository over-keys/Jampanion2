import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("Usage: customize-help.mjs viewer/help.html");
  process.exit(2);
}

const resolved = path.resolve(target);
if (!fs.existsSync(resolved)) throw new Error(`Help page not found: ${resolved}`);

let html = fs.readFileSync(resolved, "utf8");
const marker = 'id="jampanion"';
if (html.includes(marker)) process.exit(0);

html = html
  .replace("<title>ヘルプ · Jazz Chart Viewer</title>", "<title>ヘルプ · Jampanion2</title>")
  .replace("<span>Jazz Chart Viewer ヘルプ</span>", "<span>Jampanion2 ヘルプ</span>")
  .replace("<h1>Jazz Chart Viewer</h1>", "<h1>Jampanion2</h1>")
  .replace("Jazz Chart Viewerの使い方。", "Jampanion2の譜面表示、編集、伴奏機能の使い方。")
  .replace(
    "iReal形式のジャズ・コード譜をブラウザで表示し、移調やリピート展開を行うためのビューアーです。Jazz 1460の取り込みから譜面の読み方、表記設定まで、実際に使うために必要な操作をまとめています。",
    "iReal形式のジャズ・コード譜を表示し、ピアノ・ベース・ドラムの伴奏に合わせて練習・演奏できるアプリです。コードやリハーサルマークの編集、移調、リピート展開など、Jampanion2を使うために必要な操作をまとめています。"
  )
  .replace('href="./help.css"', 'href="./help.css?v=28"')
  .replaceAll('href="./help.en.html"', 'href="./help.en.html?v=28"')
  .replace("曲は、現在開いているサイトURL専用のIndexedDBへローカル保存され、表示設定は同じURLのlocalStorageへ保存されます。", "曲と表示設定は、現在開いているサイト専用のブラウザ内に保存されます。")
  .replace(
    '      <a href="#quick-start">まず使ってみる</a>',
    '      <a href="#jampanion">伴奏・編集</a>\n      <a href="#quick-start">まず使ってみる</a>'
  );

const integratedSection = String.raw`      <section id="jampanion" class="help-section">
        <h2>伴奏と譜面編集</h2>
        <p>Jampanion2では、譜面を読むだけでなく、コード進行に合わせたピアノ・ベース・ドラムの伴奏をブラウザで再生できます。まず曲をインポートして選び、画面左の<strong>Accompaniment</strong>と<strong>Session</strong>を使います。</p>

        <h3>最初の演奏</h3>
        <ol>
          <li>曲を選び、キー、<strong>Original / Expanded</strong>、テンポ、スタイルを確認します。</li>
          <li><strong>Tempo</strong>を入力し、<strong>Style</strong>で<strong>Swing / Ballad / Bossa Nova / Latin</strong>を選びます。4/4以外の曲では対応するスタイルだけが表示されます。</li>
          <li><strong>Start session</strong>を押すとカウントインの後に演奏が始まります。演奏中は譜面が現在位置へ自動スクロールします。</li>
          <li>すぐに演奏を止めるときは<strong>Stop</strong>を押します。再生中のノートオフも同時に送られます。</li>
          <li>テーマに戻って自然に終わらせるときは、演奏中の<strong>Back to head</strong>を押します。<strong>Head Out</strong>がキューされ、現在の区切りからテーマに戻って演奏したあと、曲が終了します。キューされるとボタンは<strong>Head out queued</strong>に変わります。</li>
        </ol>

        <div class="note"><strong>StopとHead Outの違い</strong>Stopはその場で伴奏を止めます。Head Outは演奏をすぐには止めず、テーマに戻る流れをキューしてから終了します。</div>

        <h3>テンポ、スタイル、保存</h3>
        <table class="control-table">
          <tbody>
            <tr><th>Tempo</th><td>上下操作は5 BPMずつ変わります。数値を直接入力すれば、1 BPM単位の値も指定できます。</td></tr>
            <tr><th>Style</th><td>Swing、Ballad、Bossa Nova、Latinから伴奏スタイルを選びます。リハーサルマークごとに別のスタイルも指定できます。</td></tr>
            <tr><th>Save</th><td>コード、リハーサルマーク、移調したキー、テンポ、スタイルの変更をまとめて保存します。Saveを押すまでは一時的な変更です。</td></tr>
          </tbody>
        </table>
        <div class="note"><strong>Key</strong>−／＋で変更した移調キーも、Saveで曲ごとに保存され、次回自動復元されます。</div>
        <div class="note"><strong>演奏中の変更</strong>スタイル変更は次の4小節区切り、テンポ変更は次の小節区切りから適用されます。音を止めずに切り替え、スタイル変更によってテンポがデフォルトへ戻ることはありません。</div>

        <h3>コードとリハーサルマークを編集する</h3>
        <ul>
          <li>コードを<strong>ダブルクリック</strong>して編集します。入力を空にして確定すると、そのコードを削除します。</li>
          <li>小節内の空いている場所を<strong>ダブルクリック</strong>すると、その拍位置にコードを追加できます。</li>
          <li>マークのない行の左側を<strong>ダブルクリック</strong>してリハーサルマークを追加し、既存のマークを<strong>ダブルクリック</strong>して名前を変更します。入力を空にして確定すると削除できます。</li>
          <li>リハーサルマークまたはその小節を<strong>右クリック</strong>すると、セクションスタイルだけを指定できます。</li>
          <li>スタイルを指定したリハーサルマークの上には、<strong>Swing / Latin / Bossa / Ballad</strong>が表示されます。曲のデフォルトを使う場合は表示されません。</li>
          <li>タイトルも<strong>ダブルクリック</strong>で変更できます。</li>
        </ul>
        <div class="warning"><strong>編集内容の保存</strong>編集したコードやマークは、<strong>Accompaniment</strong>欄の<strong>Save</strong>で保存します。曲を閉じたり別の曲を選ぶ前にSaveを押してください。最初に編集すると、インポート元を残したまま、このブラウザで編集できる曲として保存されます。</div>

        <h3>MixとMIDI</h3>
        <ul>
          <li><strong>Mix</strong>でPiano、Bass、Drumsの音量とミュートを調整できます。設定は曲を閉じても同じブラウザに保存されます。</li>
          <li><strong>Settings → Audio &amp; MIDI</strong>でMIDI inputとMIDI outputを選べます。外部MIDI出力がない場合も、<strong>Built-in Trio</strong>でブラウザ音源を使えます。</li>
          <li><strong>MIDI thru</strong>を有効にすると、選択したMIDI inputのノートを出力先へ中継できます。</li>
        </ul>
        <div class="note"><strong>スマートフォン</strong>では、Sessionの操作を上部に残し、譜面を縦にスクロールして使います。Mixは譜面の下にあります。</div>
      </section>

`;

const insertionPoint = '      <section id="quick-start" class="help-section">';
if (!html.includes(insertionPoint)) throw new Error("Quick-start section not found in help page.");
html = html.replace(insertionPoint, `${integratedSection}${insertionPoint}`);
fs.writeFileSync(resolved, html);
