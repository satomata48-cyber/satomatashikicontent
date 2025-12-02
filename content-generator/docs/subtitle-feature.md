# 字幕機能ドキュメント

## 概要

動画生成機能において、音声ファイルと台本テキストから自動的に字幕データを生成し、JSONファイルに保存する機能です。
生成された字幕データは、動画編集ソフト（Satoamtashikivideoeditor）で読み込んで表示できます。

## 機能一覧

### 1. 字幕自動生成

台本テキストと音声ファイル（WAV）から、以下のロジックで字幕を自動生成します：

1. **テキスト分割**: 台本テキストを句読点（。！？）で分割
2. **時間割り当て**: 各字幕の文字数に応じて、音声の長さを比例配分
3. **再生倍率補正**: VOICEVOXの話速設定に応じて、字幕のタイミングを調整

### 2. 字幕設定UI

左サイドパネルの「字幕設定」セクションで以下の設定が可能：

#### 1行あたりの最大文字数
- **範囲**: 15〜50文字
- **デフォルト**: 30文字
- **用途**: 長い文章を適切な長さで区切る

#### 再生倍率（VOICEVOX話速）
- **範囲**: 0.5x〜2.0x
- **デフォルト**: 1.0x
- **用途**: VOICEVOXで話速を変更した場合に、字幕のタイミングを合わせる
- **例**:
  - VOICEVOXで1.5倍速に設定 → 再生倍率を1.5xに設定
  - VOICEVOXで0.8倍速に設定 → 再生倍率を0.8xに設定

#### 句読点で分割
- **デフォルト**: オン
- **用途**: 句読点（。！？）で文を区切るかどうか
- オフにすると、最大文字数のみで分割

## データ構造

### SubtitleEntry（字幕エントリ）

```typescript
interface SubtitleEntry {
  id: string;        // 字幕の一意ID（例: "section-1-sub-0"）
  sectionId: string; // 所属するセクションのID
  startTime: number; // 開始時間（秒）
  endTime: number;   // 終了時間（秒）
  text: string;      // 字幕テキスト
}
```

### SubtitleSettings（字幕設定）

```typescript
interface SubtitleSettings {
  maxCharsPerLine: number;    // 1行あたりの最大文字数
  playbackRate: number;       // 再生倍率（1.0 = 通常速度）
  splitByPunctuation: boolean; // 句読点で分割するか
}
```

### 保存されるJSONの構造

`video-data-{projectId}.json` に以下の形式で保存：

```json
{
  "sections": [...],
  "speakerId": 3,
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "subtitles": [
    {
      "id": "section-1-sub-0",
      "sectionId": "section-1",
      "startTime": 0,
      "endTime": 2.5,
      "text": "こんにちは、今日は〇〇について説明します。"
    },
    {
      "id": "section-1-sub-1",
      "sectionId": "section-1",
      "startTime": 2.5,
      "endTime": 5.0,
      "text": "まず最初に..."
    }
  ],
  "subtitleSettings": {
    "maxCharsPerLine": 30,
    "playbackRate": 1.0,
    "splitByPunctuation": true
  }
}
```

## 使用方法

### Content Generator側

1. HTMLを見出しで分割
2. AIで台本を生成
3. VOICEVOXで音声を生成
4. 左サイドパネルの「字幕設定」で設定を調整
5. 「保存」ボタンで動画データを保存
   - 字幕データは自動的に生成・保存される

### Satoamtashikivideoeditor側（実装予定）

1. video-data-{projectId}.json を読み込み
2. `subtitles` 配列から字幕データを取得
3. 再生時間に応じて該当する字幕を表示

## ソースコード

### 主要ファイル

- `src/lib/subtitle-utils.ts` - 字幕生成ユーティリティ
- `src/lib/filesystem.ts` - データ保存/読み込み（SubtitleEntry型定義含む）
- `src/routes/project/[id]/video/+page.svelte` - 字幕設定UI

### 主要関数

#### `getWavDuration(audioData: ArrayBuffer): number`
WAVファイルから音声の長さ（秒）を取得

#### `splitTextForSubtitles(text: string, settings: SubtitleSettings): string[]`
台本テキストを設定に基づいて分割

#### `assignTimesToSentences(sentences: string[], totalDuration: number, sectionId: string, settings: SubtitleSettings): SubtitleEntry[]`
分割した文に時間を割り当てて字幕エントリを生成

#### `generateSubtitlesForSection(sectionId: string, script: string, audioData: ArrayBuffer, startOffset: number, settings: SubtitleSettings): { entries: SubtitleEntry[]; duration: number }`
セクション単位で字幕データを生成

#### `getSubtitleAtTime(subtitles: SubtitleEntry[], time: number): SubtitleEntry | null`
指定した時間に表示すべき字幕を取得

#### `adjustSubtitlesForPlaybackRate(subtitles: SubtitleEntry[], originalRate: number, newRate: number): SubtitleEntry[]`
再生倍率の変更時に字幕のタイミングを調整

## 注意事項

1. **再生倍率の設定**: VOICEVOXで話速を変更した場合、必ずContent Generatorの「再生倍率」設定も同じ値に変更してください。そうしないと字幕と音声がずれます。

2. **文字数設定**: 動画の表示サイズに応じて適切な文字数を設定してください。モバイル向けなら少なめ（20文字程度）、PC向けなら多め（35文字程度）がおすすめです。

3. **再保存で更新**: 字幕設定を変更した場合、「保存」ボタンを押すことで字幕データが再生成されます。
