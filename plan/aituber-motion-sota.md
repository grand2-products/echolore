# AITuber アバターモーション SOTA 達成計画

## 学術的根拠: 関連研究サーベイ

本計画の各コンポーネントは以下の論文・プロジェクトに基づく。

### LipSync

| 手法 | 概要 | 適用可能性 |
|------|------|-----------|
| **TalkingHead (met4citizen)** | ブラウザ JS で動作する 3D アバター lip-sync。TTS の word-level timestamp から viseme を生成。ARKit/Oculus viseme blendshape 対応。Three.js/WebGL | **直接採用可能**。我々の TTS パイプラインに viseme タイムスタンプ出力を追加し、音声解析ベースの推測を不要にする |
| **SAiD** (arXiv:2401.08655) | Diffusion ベースの音声→blendshape 係数生成。Transformer U-Net で F1/F2 フォルマントを学習 | ブラウザ推論は現実的でない（Python/PyTorch）。ただし帯域エネルギー比の設計根拠として参照 |
| **Audio2Face-3D** (arXiv:2508.16401) | 音声→ARKit blendshape weight をリアルタイム生成。MetaHuman 等に適用 | アーキテクチャの参考。ARKit viseme マッピングの標準として参照 |

**結論**: 周波数帯域の推測ではなく、**TTS viseme タイムスタンプ**が SOTA の正解。
TTS エンジンが viseme を出力できない場合のフォールバックとして帯域エネルギー比を残す。

### ジェスチャー / Co-Speech Motion

| 手法 | 概要 | 適用可能性 |
|------|------|-----------|
| **LLM Gesticulator** (arXiv:2410.10851) | LLM をバックボーンにした音声→全身ジェスチャー生成。テキストプロンプトでスタイル/内容を制御可能。スケーリング則あり | **設計方針として採用**。我々の LLM annotation 方式（`[action:nod]`）はこの論文の「テキストプロンプトによるジェスチャー制御」と同じ思想 |
| **LLM for Virtual Human Gesture Selection** (arXiv:2503.14408, AAMAS 2025) | LLM にジェスチャー選択を委ねる。GPT-4 で 6-9 秒/発話のレイテンシ | レイテンシが課題。我々のアプローチ（LLM 応答生成時に同時に annotation）はレイテンシゼロ |
| **Semantic Gesticulator** (SIGGRAPH 2024) | 意味認識型 co-speech ジェスチャー合成。セマンティクスとリズムの両方を考慮 | 参考アーキテクチャ。プリベイクモーション＋セマンティック選択は我々の設計と一致 |

**結論**: リアルタイム推論モデル（LLM Gesticulator 等）はブラウザで動かせない。
**LLM annotation + プリベイクモーションクリップ再生**が Web AITuber の最適解。
これは学術的にも LLM for Gesture Selection (AAMAS 2025) と同じアプローチ。

### 感情表現

| 手法 | 概要 | 適用可能性 |
|------|------|-----------|
| **SynchroRaMa** (arXiv:2509.19965) | マルチモーダル（視覚+テキスト+音声）の emotion embedding で感情を制御 | emotion embedding の概念を参照。我々は LLM テキスト出力から emotion を取得 |
| **EmoDiffusion** (arXiv:2503.11028) | Diffusion で感情付き 3D 顔アニメーション | アーキテクチャ参考 |

**結論**: 我々の LLM structured output emotion annotation は、
SynchroRaMa のテキストモダリティからの emotion 抽出と本質的に同じ。
ただし SynchroRaMa は学習済みモデルで embedding するのに対し、
我々は LLM の言語理解に直接委ねる。Web 環境では後者が現実的。

### TTS Viseme タイムスタンプ

TalkingHead プロジェクトの設計から、以下が判明:

- **Google Cloud TTS**: `timepoints` API で word-level タイムスタンプ取得可能
- **Azure Speech SDK**: viseme ID を直接出力可能
- **ElevenLabs**: WebSocket API で word/viseme データをストリーミング可能
- **text-to-viseme 変換**: TTS が viseme を出力できない場合、
  テキストの音素列から viseme 列を生成するルールベース変換が可能

我々の TTS サービス (`aituber-tts-service.ts`) が Google Cloud TTS を使用している場合、
`timepoints` を利用して viseme タイムスタンプを取得するのが最も直接的。

---

## 前提: 技術的事実の確認

### 座標系とカメラ配置

- カメラ位置: `(0, 1.3, 1.5)`, lookAt: `(0, 1.0, 0)`
- VRM モデル: 原点 `(0, 0, 0)` に配置、VRM 標準で **+Z 方向を正面**
- カメラは +Z=1.5 から -Z 方向（原点）を見ている
- 現在の LookAt ターゲット `(noise, 1.3, 2.0)` は、モデルから見て +Z 方向 = **カメラと概ね同じ方向**
- 厳密にはターゲット Z=2.0 はカメラ Z=1.5 の背後だが、モデル原点からの視線方向はカメラを**通過して**その先を見る形 → おおよそカメラ目線

**結論**: 視線の問題は当初の分析ほど深刻ではない。ただし改善余地はある（ドリフト品質、状態別視線）

### VRM Expression Override API

`@pixiv/three-vrm-core` v3.5.1 で確認済み:

```typescript
// VRMExpression クラスに実在するプロパティ
overrideBlink: VRMExpressionOverrideType;  // "none" | "block" | "blend"
overrideMouth: VRMExpressionOverrideType;
overrideLookAt: VRMExpressionOverrideType;
```

**重要**: `VRMExpressionManager.update()` が内部で override を処理する。
`vrm.update(delta)` → `expressionManager.update()` の呼び出しチェーンにより、
Compositor が `setValue()` した後に VRM ランタイムが override 適用を行う。

つまり **VRM の override 機構は現在の実装でも動作している可能性がある**。
ただし Compositor が毎フレーム全 expression を `setValue` で上書きするため、
VRM の内部 override 計算結果が次フレームで Compositor に上書きされる。
実際の挙動は VRM モデルの expression 定義次第であり、テストで確認が必要。

---

## 修正対象の再評価

| # | 問題 | 深刻度 | 備考 |
|---|------|--------|------|
| 1 | Expression 干渉 | 要検証 | VRM 内部 override が動いている可能性。実機テストで判定 |
| 2 | LipSync 帯域定義 | 致命的 | サンプルレート未考慮、bin→Hz 計算の誤り |
| 3 | 視線方向 | 軽微 | おおよそカメラ方向。ドリフト品質の改善余地 |
| 4 | Bone Euler 加算 | 中 | 現在の振幅域 (<0.05rad) ではジンバルロックは実質発生しない |
| 5 | Emotion クリアなし | 重大 | 一度 happy が来たら永遠に残る |
| 6 | Noise 周期性 | 中 | 約 3.3 秒周期で視認可能 |
| 7 | 呼吸が見えない | 中 | 0.008rad は視認不可能 |
| 8 | detectEmotion | 重大 | キーワードマッチは SOTA ではない。LLM structured output に置換 |
| 9 | パフォーマンス | 低 | 計測して問題があれば対応 |
| 10 | Race condition | 低 | エッジケース |

---

## 実装バッチ

10 Phase を **3 バッチ** に統合。各バッチにテスト要件を含む。
バックエンド変更は Batch 3 に分離。

### Batch 1: 致命的修正 (フロントエンドのみ)

Expression 干渉検証 + LipSync 修正 + Emotion ライフサイクル

#### 1-A: Expression 干渉の実機検証と対応

**まずテストで実態を確認する**。VRM の `expressionManager.update()` が
内部で override を処理しているなら、追加対応は不要かもしれない。

**検証手順**:
1. `happy=0.6` + `blink=1.0` を同時に `setValue` し、`vrm.update()` 後の実際の expression 値をログ出力
2. テスト用 VRM モデルの `happy` expression の `overrideBlink` 値を確認
3. override が `block` なら VRM ランタイムが blink を自動抑制しているはず

**結果次第の対応**:

- **Case A: VRM override が機能している** → 追加対応不要。ドキュメントに記載のみ
- **Case B: VRM override が機能していない** → Compositor に override ロジックを追加:

```typescript
// compositor.ts に追加
// VRM ロード時に expression の override メタデータをキャッシュ
private overrideCache = new Map<string, {
  overrideBlink: VRMExpressionOverrideType;
  overrideMouth: VRMExpressionOverrideType;
}>();

initialize(vrm: VrmInstance): void {
  // 全 expression の override 属性を読み取りキャッシュ
  // VRMExpression.overrideBlink: "none" | "block" | "blend"
}
```

**テストファイル**: `animation/compositor.test.ts`

```typescript
describe("AnimationCompositor", () => {
  it("clamps expression values to [0, 1]", () => { ... });
  it("merges bone rotations additively", () => { ... });
  it("lerps toward target values", () => { ... });
  // Case B の場合のみ:
  it("suppresses blink when face expression has overrideBlink=block", () => { ... });
});
```

#### 変更ファイル
- `animation/compositor.ts` — `initialize()` 追加、override キャッシュ（Case B のみ）
- `animation/compositor.test.ts` — 新規

---

#### 1-B: LipSync — TTS Viseme タイムスタンプ方式

**問題の核心**: 周波数帯域から母音を推測するアプローチ自体が SOTA ではない。
サンプルレート未考慮・bin→Hz 計算の誤り以前に、設計が間違っている。

**学術的根拠**: TalkingHead (met4citizen/TalkingHead) が実証済みの通り、
TTS エンジンから word-level/viseme-level タイムスタンプを取得し、
音素→viseme マッピングで口形状を制御するのが正解。
SAiD (arXiv:2401.08655) や Audio2Face-3D (arXiv:2508.16401) も
音声解析ではなく学習済みモデルで blendshape を直接生成する。

**解決策**: 2 層アーキテクチャ

**Layer 1 (SOTA): TTS Viseme タイムスタンプ**

TTS バックエンドから viseme データを取得し、data channel でフロントに送信。

バックエンド変更 (`aituber-tts-service.ts`):
```typescript
interface TtsResult {
  audio: Buffer;
  mimeType: string;
  visemes: Array<{ time: number; viseme: string }>; // 新規
}

// Google Cloud TTS の場合:
// synthesizeSpeech() で timepoints を取得
// テキストの音素列から viseme 列に変換

// 日本語音素→viseme マッピング (ARKit 準拠):
// あ → viseme_aa
// い → viseme_I
// う → viseme_U
// え → viseme_E
// お → viseme_O
// ん → viseme_nn
// 子音 → 対応する viseme (k→viseme_kk, s→viseme_SS, etc.)
```

Data Channel イベント (`contracts/index.ts`):
```typescript
| { type: "tts-audio"; audio: string; mimeType: string;
    visemes?: Array<{ time: number; viseme: string }> }
```

フロントエンド (`lip-sync-layer.ts`):
```typescript
class LipSyncLayer implements AnimationLayer {
  private visemeQueue: Array<{ time: number; viseme: string }> = [];
  private playbackStartTime = 0;

  setVisemes(visemes: Array<{ time: number; viseme: string }>): void {
    this.visemeQueue = visemes;
    this.playbackStartTime = performance.now();
  }

  update(delta: number, context: AnimationContext): LayerOutput {
    if (this.visemeQueue.length > 0 && context.avatarState === "talking") {
      // タイムスタンプに基づいて現在の viseme を決定
      const elapsed = (performance.now() - this.playbackStartTime) / 1000;
      const current = this.findCurrentViseme(elapsed);
      return { expressions: this.visemeToExpressions(current) };
    }

    // viseme データがない場合は Layer 2 にフォールバック
    return this.audioFallback(delta, context);
  }

  private visemeToExpressions(viseme: string): Record<string, number> {
    // ARKit viseme → VRM expression マッピング
    const map: Record<string, Record<string, number>> = {
      viseme_aa: { aa: 1.0 },
      viseme_I:  { ih: 0.8, ee: 0.3 },
      viseme_U:  { ou: 0.9 },
      viseme_E:  { ee: 0.8, ih: 0.2 },
      viseme_O:  { oh: 0.9 },
      viseme_nn: { ou: 0.2 },        // 閉口に近い
      viseme_kk: { ih: 0.3 },        // 口を少し開ける
      viseme_SS: { ih: 0.4, ee: 0.2 }, // 歯を見せる
      // ... 他の子音 viseme
    };
    return map[viseme] ?? {};
  }
}
```

**Layer 2 (フォールバック): 帯域エネルギー比**

TTS が viseme を出力できない場合（外部 TTS、設定なし等）、
AnalyserNode の周波数データから母音を推定する。
現在の実装を**サンプルレート対応に修正**して残す。

```typescript
private audioFallback(delta: number, context: AnimationContext): LayerOutput {
  if (!context.audioAnalyser) return this.decayAll();

  // サンプルレートから bin→Hz 変換
  const hzPerBin = context.audioSampleRate / (context.audioAnalyser.fftSize || 256);
  // ... 帯域エネルギー比で母音推定 (既存ロジックの修正版)
}
```

**AnimationContext への追加**:
```typescript
interface AnimationContext {
  // 既存...
  audioSampleRate: number;
  visemes: Array<{ time: number; viseme: string }> | null; // TTS viseme データ
}
```

**テストファイル**: `animation/lip-sync-layer.test.ts`

```typescript
describe("LipSyncLayer", () => {
  describe("viseme timestamp mode", () => {
    it("selects correct viseme based on elapsed time", () => { ... });
    it("maps viseme_aa to aa expression", () => { ... });
    it("transitions smoothly between visemes", () => { ... });
  });
  describe("audio fallback mode", () => {
    it("computes correct bin ranges for 48kHz/512 fftSize", () => { ... });
    it("returns zero expressions when not talking", () => { ... });
  });
});
```

#### 変更ファイル
- `animation/lip-sync-layer.ts` — viseme タイムスタンプ方式 + 帯域フォールバック
- `animation/types.ts` — `AnimationContext` に `audioSampleRate`, `visemes` 追加
- `AituberStage.tsx` — `fftSize=512`, `sampleRate` 伝達, viseme データの store 連携
- `AituberAvatar.tsx` — props に `audioSampleRate`, `visemes` 追加
- `use-aituber-store.ts` — `tts-audio` イベントの viseme データ保持
- `aituber-tts-service.ts` — viseme タイムスタンプ取得 (バックエンド)
- `contracts/index.ts` — `tts-audio` イベントに `visemes` 追加
- `animation/lip-sync-layer.test.ts` — 新規

---

#### 1-C: Emotion ライフサイクル

**問題**: emotion が store にセットされた後クリアされない。

**解決策**: フロントエンドのみで完結する自動フェードアウト。
バックエンドから duration/クリアイベントを送る設計は過剰 — フロントエンドの
EmotionLayer 内部で時間ベースのフェードアウトを行う。

```typescript
// emotion-layer.ts
class EmotionLayer implements AnimationLayer {
  private currentType: EmotionType = "neutral";
  private currentIntensity = 0;
  private targetIntensity = 0;
  private lastEmotionRef: EmotionState | null = null;
  private holdTimer = 0;

  private static HOLD_DURATION = 5; // 秒 — emotion を保持する時間
  private static FADE_SPEED = 3;    // 1/s

  update(delta: number, context: AnimationContext): LayerOutput {
    const emotion = context.emotion;

    // 新しい emotion を検知
    if (emotion && emotion !== this.lastEmotionRef && emotion.type !== "neutral") {
      this.currentType = emotion.type;
      this.targetIntensity = emotion.intensity;
      this.holdTimer = EmotionLayer.HOLD_DURATION;
      this.lastEmotionRef = emotion;
    }

    // hold timer のカウントダウン
    if (this.holdTimer > 0) {
      this.holdTimer -= delta;
      if (this.holdTimer <= 0) {
        this.targetIntensity = 0; // フェードアウト開始
      }
    }

    // 内部 lerp
    this.currentIntensity += (this.targetIntensity - this.currentIntensity)
      * (1 - Math.exp(-EmotionLayer.FADE_SPEED * delta));

    if (this.currentIntensity < 0.01) {
      this.currentIntensity = 0;
      return {};
    }

    // ... EMOTION_MAP から expression を返す
  }
}
```

**store の emotion は setTimeout を使わない** — timer リーク問題を回避。
EmotionLayer 自体が hold → fadeout を管理する。store は単にイベントを中継するだけ。

**StateExpressionLayer との happy 競合**:
- face グループ expression に限り、Compositor で **max マージ** を適用（加算ではなく）
- `compositor.ts` で expression グループ定義を追加:
  ```typescript
  const FACE_EXPRESSIONS = new Set(["happy", "sad", "angry", "surprised", "relaxed", "neutral"]);
  // マージ時: FACE_EXPRESSIONS に含まれる名前は max、それ以外は加算
  ```

**テストファイル**: `animation/emotion-layer.test.ts`

```typescript
describe("EmotionLayer", () => {
  it("fades out after HOLD_DURATION seconds", () => {
    const layer = new EmotionLayer();
    const ctx = makeContext({ emotion: { type: "happy", intensity: 0.8 } });

    // Hold 期間中は intensity が維持される
    const out1 = layer.update(0.016, ctx);
    expect(out1.expressions?.happy).toBeGreaterThan(0);

    // 5 秒後にフェードアウト開始
    for (let i = 0; i < 350; i++) layer.update(0.016, ctx); // ~5.6s
    const out2 = layer.update(0.016, ctx);
    expect(out2.expressions?.happy).toBeLessThan(0.1);
  });

  it("does not interfere with blink expressions", () => { ... });
});
```

#### 変更ファイル
- `animation/emotion-layer.ts` — hold timer + internal fadeout
- `animation/compositor.ts` — face グループ max マージ
- `animation/emotion-layer.test.ts` — 新規

---

### Batch 2: 品質向上 (フロントエンドのみ)

Noise 改善 + 呼吸 + 視線ドリフト + Quaternion + Race condition

#### 2-A: Noise 改善 + アイドルモーション

```typescript
// noise.ts に追加
export function fbm1D(x: number, octaves = 3): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += noise1D(x * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.17; // 非整数倍で周期性を壊す
  }
  return value;
}
```

- `idle-motion-layer.ts`: `noise1D` → `fbm1D` に全て置換

#### 変更ファイル
- `animation/noise.ts` — `fbm1D` 追加
- `animation/idle-motion-layer.ts` — fbm 切替

---

#### 2-B: 呼吸振幅の修正

amplitude を 0.008rad → 0.035rad に増加、3 ボーン連動。

```typescript
// breathing-layer.ts
const amp = isTalking ? 0.045 : 0.035;
return {
  boneRotations: {
    chest:      { x: phase * amp,       y: 0, z: 0 },
    upperChest: { x: phase * amp * 0.5, y: 0, z: phase * amp * 0.2 },
    spine:      { x: phase * amp * 0.3, y: 0, z: 0 },
  },
};
```

#### 変更ファイル
- `animation/breathing-layer.ts` — 振幅・ボーン数修正

---

#### 2-C: 視線ドリフト改善

現在の実装はおおよそカメラ方向を見ているが、ドリフト品質を改善する。

- `fbm1D` に切替（noise1D からの改善）
- 状態別の視線オフセット:
  - thinking: 右上を見る（`x += 0.3, y += 0.15`）
  - talking: ドリフト振幅 × 1.3
- ターゲット位置をカメラ位置基準に修正（Z=2.0 → カメラ Z=1.5 付近）

#### 変更ファイル
- `animation/look-at-layer.ts` — fbm 切替、状態別オフセット、Z 座標修正

---

#### 2-D: Bone Rotation の Quaternion 化

**現在の振幅域 (<0.05rad) ではジンバルロックは実質発生しない**が、
`boneNode.rotation.x/y/z` の直接代入が quaternion と同期しない問題がある。

**解決策**: Compositor で `boneNode.quaternion` を直接操作する。
レイヤーは引き続き `{ x, y, z }` (Euler 差分) を返す — 振幅が小さいため
Euler→Quaternion 変換の誤差は negligible。

```typescript
// compositor.ts の bone 適用部分を変更:
const boneNode = vrm.humanoid?.getNormalizedBoneNode(name);
if (boneNode) {
  // .rotation ではなく .quaternion を使用
  tempEuler.set(newRot.x, newRot.y, newRot.z, "XYZ");
  boneNode.quaternion.setFromEuler(tempEuler);
}
```

**THREE.js の注入**: `AnimationCompositor.setThree(THREE)` メソッドで
Euler/Quaternion コンストラクタを注入。動的 import に対応。

#### 変更ファイル
- `animation/compositor.ts` — `setThree()`, quaternion 適用
- `AituberAvatar.tsx` — `compositor.setThree(THREE)` 呼び出し追加

---

#### 2-E: AituberAvatar の Race Condition 修正

```typescript
// AituberAvatar.tsx
useEffect(() => {
  if (!containerRef.current || !avatarUrl) return;
  const abortController = new AbortController();

  const initScene = async () => {
    // 各 await 後に abortController.signal.aborted をチェック
    const THREE = await import("three");
    if (abortController.signal.aborted) return;
    // ...
  };

  void initScene();

  return () => {
    abortController.abort();
    cancelAnimationFrame(animFrameRef.current);
    compositorRef.current?.reset();
    // scene.traverse で geometry/material/texture を dispose
    // renderer.dispose(); renderer.forceContextLoss();
  };
}, [avatarUrl]);
```

#### 変更ファイル
- `AituberAvatar.tsx` — AbortController, リソース解放

---

### Batch 3: バックエンド改善 (API のみ)

感情検出を LLM structured output に置換。フロントエンドとは独立して実施可能。

#### 3-A: LLM Structured Output による感情 annotation

**キーワードマッチ + 否定フィルターは根本的に SOTA ではない。**
LLM 自体が文脈を理解しているのだから、LLM に感情を出力させるのが正しい設計。

**方式**: システムプロンプトに annotation 指示を追加し、
LLM 応答の先頭に `[emotion:TYPE:INTENSITY]` タグを含めさせる。
バックエンドでパース → テキストから除去 → emotion イベント送信 → TTS に渡す。

**`buildSystemPrompt()` への追加**:
```typescript
function buildSystemPrompt(character: AituberCharacter): string {
  let prompt = character.systemPrompt;
  // ... 既存のキャラクター情報 ...

  // emotion annotation 指示
  prompt += "\n\n【重要】応答の先頭に必ず [emotion:TYPE:INTENSITY] を付与してください。";
  prompt += "\nTYPE: neutral, happy, sad, angry, surprised, relaxed のいずれか";
  prompt += "\nINTENSITY: 0.0〜1.0 の小数（感情の強さ）";
  prompt += "\n例: [emotion:happy:0.7] わーい、ありがとう！";
  prompt += "\n例: [emotion:sad:0.4] それは残念だね...";
  prompt += "\n例: [emotion:neutral:0.0] そうですね、確かにその通りです。";

  return prompt;
}
```

**`parseEmotionAnnotation()` — 新規関数**:
```typescript
interface ParsedResponse {
  text: string;
  emotion: { type: string; intensity: number } | null;
}

const EMOTION_TAG_RE = /^\[emotion:(\w+):([\d.]+)\]\s*/;

function parseEmotionAnnotation(rawText: string): ParsedResponse {
  const match = rawText.match(EMOTION_TAG_RE);
  if (!match) {
    return { text: rawText, emotion: null };
  }

  const [fullMatch, type, intensityStr] = match;
  const validTypes = ["neutral", "happy", "sad", "angry", "surprised", "relaxed"];
  const intensity = Math.min(Math.max(parseFloat(intensityStr ?? "0"), 0), 1);

  return {
    text: rawText.slice(fullMatch.length).trim(),
    emotion: validTypes.includes(type ?? "")
      ? { type: type as string, intensity }
      : null,
  };
}
```

**`processNextMessage()` の変更**:
```typescript
// 現在:
const responseText = await generateStreamingResponse(...);
const emotion = detectEmotion(responseText); // ← キーワードマッチ（削除）

// 変更後:
const rawResponse = await generateStreamingResponse(...);
const { text: responseText, emotion } = parseEmotionAnnotation(rawResponse);
```

ストリーミング中のトークンにはタグが含まれるが、
`ai-complete` イベントの `fullContent` にはパース済みテキストを送信する。
フロントエンド側のチャット表示にタグが露出しない。

**`detectEmotion()` と `EMOTION_PATTERNS` は完全削除**。
フォールバックとして残す必要はない — LLM がタグを出力しなかった場合は
emotion なし (neutral) として扱う。これは正しい動作。

**テストファイル**: `services/aituber/aituber-ai-service.test.ts` に追加

```typescript
describe("parseEmotionAnnotation", () => {
  it("parses valid emotion tag", () => {
    const result = parseEmotionAnnotation("[emotion:happy:0.7] やったー！");
    expect(result.emotion).toEqual({ type: "happy", intensity: 0.7 });
    expect(result.text).toBe("やったー！");
  });

  it("returns null emotion for missing tag", () => {
    const result = parseEmotionAnnotation("普通の応答です");
    expect(result.emotion).toBeNull();
    expect(result.text).toBe("普通の応答です");
  });

  it("clamps intensity to [0, 1]", () => {
    const result = parseEmotionAnnotation("[emotion:angry:1.5] 怒った！");
    expect(result.emotion?.intensity).toBe(1);
  });

  it("rejects invalid emotion types", () => {
    const result = parseEmotionAnnotation("[emotion:rage:0.8] 怒った！");
    expect(result.emotion).toBeNull();
  });

  it("handles tag without trailing space", () => {
    const result = parseEmotionAnnotation("[emotion:sad:0.3]悲しいです");
    expect(result.emotion).toEqual({ type: "sad", intensity: 0.3 });
    expect(result.text).toBe("悲しいです");
  });

  it("only matches tag at the beginning of text", () => {
    const result = parseEmotionAnnotation("途中に [emotion:happy:0.5] がある");
    expect(result.emotion).toBeNull();
    expect(result.text).toBe("途中に [emotion:happy:0.5] がある");
  });
});
```

#### 変更ファイル
- `apps/api/src/services/aituber/aituber-ai-service.ts`:
  - `buildSystemPrompt()` に emotion annotation 指示を追加
  - `parseEmotionAnnotation()` 新規関数を追加
  - `processNextMessage()` で `detectEmotion()` を `parseEmotionAnnotation()` に置換
  - `detectEmotion()`, `EMOTION_PATTERNS`, `DetectedEmotion` を完全削除
- `apps/api/src/services/aituber/aituber-ai-service.test.ts` — テスト追加

---

### Batch 4: モーションクリップ再生システム (フロントエンド + アセット)

プロシージャルモーションだけでは SOTA にならない。
お辞儀、挨拶、うなずき、手振り、リアクション — これらは**プリベイクされたモーションクリップ**が必要。

#### 現状

- THREE.js `AnimationMixer` / `AnimationClip` / `AnimationAction` — **利用可能、未使用**
- `BVHLoader`, `FBXLoader` — **インストール済み、未使用**
- `@pixiv/three-vrm-animation` — **未インストール**（npm に存在する VRMA フォーマット用）
- 現在のレイヤーアーキテクチャにクリップ再生の概念が**ゼロ**

#### アーキテクチャ: MotionClipLayer

`AnimationMixer` を内部に持つ新レイヤーを Compositor に追加する。
プロシージャルレイヤーとクリップレイヤーの出力を Compositor が合成する。

```
AnimationCompositor
  ├── BlinkLayer          (プロシージャル — 顔)
  ├── BreathingLayer      (プロシージャル — 体)
  ├── IdleMotionLayer     (プロシージャル — 体)
  ├── LipSyncLayer        (プロシージャル — 顔)
  ├── EmotionLayer        (プロシージャル — 顔)
  ├── StateExpressionLayer(プロシージャル — 顔)
  ├── LookAtLayer         (プロシージャル — 目)
  └── MotionClipLayer     (クリップ再生 — 体)  ← 新規
```

**合成ルール**: クリップ再生中は body ボーン（spine, chest, upperChest, shoulders, arms）の
プロシージャル出力をクリップの出力で**上書き**する。
顔の expression（blink, lip, emotion）はプロシージャルのまま維持。

```typescript
// animation/motion-clip-layer.ts

interface MotionClipDef {
  name: string;
  url: string;          // VRMA/FBX/BVH ファイル URL
  duration: number;     // 秒
  affectedBones: string[]; // このクリップが制御するボーン名リスト
  loop: boolean;
  fadeIn: number;       // ブレンドイン時間 (秒)
  fadeOut: number;
}

class MotionClipLayer implements AnimationLayer {
  private mixer: THREE.AnimationMixer | null = null;
  private clips = new Map<string, THREE.AnimationClip>();
  private currentAction: THREE.AnimationAction | null = null;
  private currentDef: MotionClipDef | null = null;

  initialize(vrm: VRM, THREE: typeof import("three")): void {
    this.mixer = new THREE.AnimationMixer(vrm.scene);
  }

  async loadClip(def: MotionClipDef, THREE: typeof import("three")): Promise<void> {
    // URL から VRMA/FBX/BVH をロードし AnimationClip を取得
    // clips Map にキャッシュ
  }

  play(clipName: string): void {
    const clip = this.clips.get(clipName);
    if (!clip || !this.mixer) return;

    // 現在のアクションをフェードアウト
    if (this.currentAction) {
      this.currentAction.fadeOut(this.currentDef?.fadeOut ?? 0.3);
    }

    // 新しいアクションをフェードイン
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.fadeIn(this.currentDef?.fadeIn ?? 0.3);
    action.play();
    this.currentAction = action;
  }

  update(delta: number, _context: AnimationContext): LayerOutput {
    this.mixer?.update(delta);

    // AnimationMixer が VRM の bone を直接操作するため、
    // LayerOutput で bone rotation を返す必要はない。
    // ただし Compositor がプロシージャルの bone 出力で上書きしないよう、
    // 再生中のボーン名リストを通知する。
    return {
      lockedBones: this.currentAction?.isRunning()
        ? new Set(this.currentDef?.affectedBones ?? [])
        : undefined,
    };
  }

  reset(): void {
    this.mixer?.stopAllAction();
    this.currentAction = null;
  }
}
```

**Compositor の変更**:
```typescript
// LayerOutput に lockedBones を追加
interface LayerOutput {
  expressions?: Partial<Record<string, number>>;
  boneRotations?: Partial<Record<string, { x: number; y: number; z: number }>>;
  lockedBones?: Set<string>; // クリップ再生中、他レイヤーの bone 出力を無視
}

// Compositor.update() で:
// 1. 全レイヤーの出力を収集
// 2. lockedBones を持つレイヤーがあれば、そのボーンの他レイヤー出力を除外
// 3. 残りの bone rotation をマージ → lerp → apply
```

#### モーションライブラリ設計

HY-Motion で無限にモーションを生成できるため、10 個に絞る必要はない。
**大量のバリエーションを事前生成**し、LLM が文脈に応じて最適なクリップをセマンティックに選択する。

**カテゴリ別クリップ数の目安**:

| カテゴリ | クリップ数 | 例 |
|---------|----------|---|
| 挨拶・礼 | 5-8 | 軽いお辞儀、深いお辞儀、手を振る（大/小）、会釈、片手挙げ |
| うなずき・同意 | 5-8 | 浅いうなずき、深いうなずき、連続うなずき、首かしげ同意、拍手 |
| 感情リアクション | 8-12 | 笑い（控えめ/大笑い/照れ笑い）、驚き（軽/大）、悲しみ、怒り、感動 |
| 考えるポーズ | 3-5 | 顎に手、腕組み、頭をかく、指を立てる |
| アイドル | 5-8 | 重心移動、伸び、見回し、髪を触る、腕を組み替え |
| 説明・指示 | 3-5 | 手を前に出す、指さし、両手広げ |
| 合計 | **~40-50 クリップ** | |

同じ「うなずき」でも 5 バリエーションあれば、毎回同じ動きにならない。

**メタデータ付きクリップ管理**:

```typescript
// public/motions/manifest.json — モーションライブラリのインデックス
{
  "clips": [
    {
      "id": "greeting-bow-polite",
      "file": "greeting-bow-polite.vrma",
      "category": "greeting",
      "description": "Polite bow from waist, hands together, 30 degree lean",
      "tags": ["greeting", "polite", "formal", "bow"],
      "duration": 2.0,
      "loop": false
    },
    {
      "id": "greeting-wave-casual",
      "file": "greeting-wave-casual.vrma",
      "category": "greeting",
      "description": "Casual right hand wave at shoulder height with head tilt",
      "tags": ["greeting", "casual", "wave", "friendly"],
      "duration": 2.0,
      "loop": false
    },
    {
      "id": "nod-gentle-1",
      "file": "nod-gentle-1.vrma",
      "category": "nod",
      "description": "Gentle single nod, slight forward lean",
      "tags": ["agree", "nod", "gentle", "understanding"],
      "duration": 0.8,
      "loop": false
    },
    // ... 40-50 クリップ
  ]
}
```

**LLM によるセマンティック選択** — 固定 enum ではなくメタデータで選ぶ:

```
# buildSystemPrompt() に追加:
応答にジェスチャーが自然な場合、先頭タグの後に [action:CLIP_ID] を付与してください。
以下のモーションライブラリから最適なものを選んでください:

greeting: greeting-bow-polite, greeting-bow-casual, greeting-wave-casual, greeting-wave-big, greeting-nod-hello
nod: nod-gentle-1, nod-gentle-2, nod-deep, nod-continuous, nod-with-tilt
laugh: laugh-subtle, laugh-hearty, laugh-shy, laugh-with-clap
surprise: surprise-lean-back, surprise-hands-up, surprise-step-back
think: think-chin-hand, think-arms-crossed, think-head-scratch
idle: idle-shift-1, idle-shift-2, idle-stretch, idle-look-around, idle-hair-touch
explain: explain-hands-forward, explain-point, explain-hands-spread

例: [emotion:happy:0.8][action:greeting-wave-casual] やっほー！元気？
例: [emotion:neutral:0.0][action:nod-gentle-1] うん、そうだね。
アクションが不要な場合はタグを省略してください。同じアクションが連続しないよう、バリエーションを使い分けてください。
```

これにより LLM は**文脈に応じてバリエーションを自然に使い分ける**。
「やっほー」なら `greeting-wave-casual`、「はじめまして」なら `greeting-bow-polite` を選ぶ。

#### モーションデータの調達: 3 ルート

モーションクリップの調達には 3 つのルートがあり、クリップの種類に応じて使い分ける。

**形式**: **VRMA** (VRM Animation) で統一。
VRM Humanoid のボーン名に直接マッピングされるため、リターゲティング不要。

```bash
pnpm add @pixiv/three-vrm-animation
```

```typescript
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from "@pixiv/three-vrm-animation";

loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
const gltf = await loader.loadAsync("/motions/greeting.vrma");
const vrmAnimation = gltf.userData.vrmAnimations[0];
const clip = createVRMAnimationClip(vrmAnimation, vrm);
```

##### ルート A: HY-Motion 1.0 (ComfyUI) → VRMA 変換 (メインルート)

**[HY-Motion 1.0](https://github.com/Tencent-Hunyuan/HY-Motion-1.0)** (Tencent Hunyuan, 2025/12/30 リリース) で
テキストからモーションを生成し、FBX 出力を VRMA に変換する。
2026 年 3 月時点の text-to-motion **OSS SOTA**。

**HY-Motion の優位性**:
- **OSS**: 課金なし、オフライン実行、再現性 100%
- **10 億パラメータ級 DiT + Flow Matching**: 既存 OSS モデル (MoMask, MDM 等) を凌駕
- **ComfyUI ノード**: [ComfyUI-HY-Motion1](https://github.com/jtydhr88/ComfyUI-HY-Motion1) でワークフロー化
- **FBX/GLB エクスポート内蔵**: Mixamo スケルトンへのリターゲット対応
- **性能**: 12GB GPU (Lite モデル) で 12 秒アニメーション → 約 40 秒で生成
- **Hugging Face**: [tencent/HY-Motion-1.0](https://huggingface.co/tencent/HY-Motion-1.0)

**ライセンス上の注意 — 利用者の責任で判断すること**:

HY-Motion 1.0 のライセンス (Tencent Hunyuan Community License) は MIT ではない。
生成物の利用にあたり以下の制約を理解した上で、利用者自身の判断で使用する。

1. **利用地域制限**: EU、英国、韓国は Territory 外。これらの地域での Output 利用は許諾されていない
2. **他 AI モデルへの利用禁止**: 生成モーションを別の AI モデルの学習・改善データに使用することは禁止（HY-Motion 自身の派生モデルを除く）
3. **法令順守・Acceptable Use Policy**: 違法・有害用途禁止。Output の再配布でも制限を引き継ぐ
4. **MAU 100 万超の場合は別途ライセンス**: リリース日時点で全サービス合計 MAU が前月 100 万超なら Tencent から別途許諾が必要

上記制約が問題となる場合、ルート B (Blender 手作り) またはライセンスフリーな
代替モデルでの生成に切り替える。モーションデータ自体は VRMA 形式で標準化されているため、
生成ツールの切り替えは下流の実装に影響しない。

**生成パイプライン**:
```bash
# 1. ComfyUI + HY-Motion ノードでテキスト→FBX 生成
#    または CLI: hy-motion-fbx-exporter でワンライナー生成
#    https://github.com/zysilm-ai/hy-motion-fbx-exporter

# 2. fbx2vrma-converter で VRMA に変換
node fbx2vrma-converter.js -i ./generated-fbx/ -o ./public/motions/
```

**プロンプト定義 (抜粋 — 全量は `motions/prompts.yaml` で管理)**:

| カテゴリ | ID | プロンプト | 秒 |
|---------|----|---------|----|
| greeting | `greeting-bow-polite` | "A person bows politely from the waist with hands together, 30 degree lean" | 2.0 |
| greeting | `greeting-bow-casual` | "A person gives a quick casual nod-bow, slight forward lean with a smile" | 1.5 |
| greeting | `greeting-wave-big` | "A person waves right hand enthusiastically high above head" | 2.0 |
| greeting | `greeting-wave-casual` | "A person waves right hand casually at shoulder height with head tilt" | 2.0 |
| greeting | `greeting-hand-raise` | "A person raises right hand briefly in a casual hello gesture" | 1.2 |
| nod | `nod-gentle-1` | "A person nods gently once, slight forward head movement" | 0.8 |
| nod | `nod-gentle-2` | "A person nods softly with a slight tilt to the right" | 0.8 |
| nod | `nod-deep` | "A person nods deeply with eyes closing briefly, whole upper body follows" | 1.2 |
| nod | `nod-continuous` | "A person nods rapidly three times in agreement" | 1.5 |
| nod | `nod-with-tilt` | "A person nods once while tilting head to the side thoughtfully" | 1.0 |
| laugh | `laugh-subtle` | "A person chuckles with slight shoulder movement, one hand near mouth" | 2.0 |
| laugh | `laugh-hearty` | "A person laughs heartily, shoulders shaking, slight lean back" | 2.5 |
| laugh | `laugh-shy` | "A person laughs shyly, looking down with hand covering mouth" | 2.0 |
| surprise | `surprise-lean-back` | "A person leans back slightly in surprise, eyebrows up" | 1.5 |
| surprise | `surprise-hands-up` | "A person raises both hands near face in shock, step back" | 1.5 |
| think | `think-chin-hand` | "A person rests chin on right hand thoughtfully, looking up" | loop |
| think | `think-arms-crossed` | "A person crosses arms and tilts head, deep in thought" | loop |
| think | `think-head-scratch` | "A person scratches the back of head, puzzled expression" | 2.0 |
| sad | `sad-look-down` | "A person looks down sadly with slumped shoulders" | 2.0 |
| sad | `sad-sigh` | "A person sighs deeply, shoulders dropping" | 2.5 |
| angry | `angry-fist-clench` | "A person clenches fists at sides with tense posture" | 1.5 |
| explain | `explain-hands-forward` | "A person gestures with both hands forward, palms up, explaining" | 2.0 |
| explain | `explain-point` | "A person points forward with right index finger for emphasis" | 1.5 |
| explain | `explain-hands-spread` | "A person spreads both hands wide, presenting an idea" | 2.0 |
| idle | `idle-shift-1` | "A person shifts weight from left to right foot naturally" | 3.0 |
| idle | `idle-shift-2` | "A person shifts weight with slight hip sway, relaxed" | 3.0 |
| idle | `idle-stretch` | "A person stretches arms overhead briefly then relaxes" | 3.5 |
| idle | `idle-look-around` | "A person looks left then right casually, curious" | 3.0 |
| idle | `idle-hair-touch` | "A person touches hair behind ear, fidgeting naturally" | 2.0 |
| ... | ... | (合計 ~50 クリップ、全量は `motions/prompts.yaml`) | ... |

**生成されたファイルは `public/motions/` にコミット**する。
ランタイムで AI 生成する必要はない — ビルド時にリポジトリに入っていればよい。
新しいモーションが必要になったらプロンプトを YAML に追加して `generate-motions.sh` を再実行するだけ。

##### ルート B: Blender → VRMA エクスポート (微調整・カスタム用)

HY-Motion の出力を微調整したい場合や、キャラクター固有のモーションが必要な場合。

1. HY-Motion の FBX 出力を Blender にインポート
2. キーフレームを手動調整
3. VRM Add-on for Blender で VRMA エクスポート

##### アセット管理

- VRMA ファイル + `manifest.json` を `public/motions/` に配置
- ビルド時に静的アセットとして配信
- 1 クリップあたり 50-200KB、全 ~50 クリップで **~5-10MB**
- VRM ロード完了後にバックグラウンドで **manifest.json だけ先読み**
- 個別クリップは LLM が選択した時点で **オンデマンドロード + キャッシュ**
  （50 クリップ全部をプリロードしない）

##### バッチ生成スクリプト

HY-Motion で大量クリップを一括生成するスクリプトをリポジトリに含める:

```bash
# scripts/generate-motions.sh
# プロンプト定義ファイルから一括生成 → VRMA 変換 → manifest.json 更新

# 1. プロンプト定義 (YAML)
cat motions/prompts.yaml
# - id: greeting-bow-polite
#   prompt: "A person bows politely from the waist..."
#   duration: 2.0
#   category: greeting
#   tags: [greeting, polite, formal, bow]
# - id: greeting-wave-casual
#   prompt: "A person waves right hand cheerfully..."
#   ...

# 2. HY-Motion CLI で一括生成
for prompt in $(yq '.[] | .id' motions/prompts.yaml); do
  hy-motion-fbx-exporter --prompt "$(yq ".[] | select(.id == \"$prompt\") | .prompt" motions/prompts.yaml)" \
    --output "./generated-fbx/${prompt}.fbx"
done

# 3. VRMA 変換
node fbx2vrma-converter.js -i ./generated-fbx/ -o ./public/motions/

# 4. manifest.json 生成
node scripts/build-motion-manifest.js
```

プロンプト定義を YAML で管理し、再生成が必要な時はスクリプト 1 発で全クリップを更新できる。

#### LLM アクション annotation

emotion annotation と同様に、LLM にアクション指示も出力させる。

**`buildSystemPrompt()` — manifest.json からクリップリストを動的生成**:

```typescript
function buildSystemPrompt(character: AituberCharacter, manifest: MotionManifest): string {
  // ... 既存のキャラクター情報 ...

  // モーションライブラリから action 選択肢を動的に構築
  const clipList = manifest.clips
    .map(c => `${c.id}: ${c.description}`)
    .join("\n");

  prompt += "\n\n応答にジェスチャーが自然な場合、先頭タグの後に [action:CLIP_ID] を付与してください。";
  prompt += "\n以下のモーションライブラリから最適なものを選んでください:\n";
  prompt += clipList;
  prompt += "\n\n例: [emotion:happy:0.8][action:greeting-wave-casual] やっほー！元気？";
  prompt += "\n例: [emotion:neutral:0.0][action:nod-gentle-1] うん、そうだね。";
  prompt += "\nアクションが不要な場合はタグを省略。同じアクションが連続しないようバリエーションを使い分けて。";

  return prompt;
}
```

manifest.json をバックエンドで読み込み、利用可能なクリップ ID + description をプロンプトに含める。
新しいモーションを追加した時、コードの変更なしで LLM が自動的に使い始める。

**`parseAnnotations()`**:
```typescript
const ACTION_TAG_RE = /^\[action:([\w-]+)\]\s*/;

function parseAnnotations(rawText: string, manifest: MotionManifest): {
  text: string;
  emotion: { type: string; intensity: number } | null;
  action: string | null;
} {
  let text = rawText;

  // emotion タグ
  const emotionMatch = text.match(EMOTION_TAG_RE);
  let emotion = null;
  if (emotionMatch) {
    // ... 既存パース ...
    text = text.slice(emotionMatch[0].length);
  }

  // action タグ — manifest に存在するクリップ ID のみ受理
  const actionMatch = text.match(ACTION_TAG_RE);
  let action = null;
  if (actionMatch) {
    const clipId = actionMatch[1] ?? "";
    if (manifest.clips.some(c => c.id === clipId)) {
      action = clipId;
    }
    text = text.slice(actionMatch[0].length);
  }

  return { text: text.trim(), emotion, action };
}
```

**Data Channel イベント**:
```typescript
// contracts/index.ts に追加
| { type: "action"; action: string }
```

**フロントエンド store → MotionClipLayer への伝達**:
- store に `pendingAction: string | null` を追加
- `AnimationContext` に `action: string | null` を追加
- MotionClipLayer が `context.action` を見てクリップを再生

#### テストファイル

**`animation/motion-clip-layer.test.ts`**:
```typescript
describe("MotionClipLayer", () => {
  it("returns empty output when no clip is playing", () => { ... });
  it("returns lockedBones during clip playback", () => { ... });
  it("fades out current clip before playing new one", () => { ... });
});
```

**`aituber-ai-service.test.ts` に追記**:
```typescript
describe("parseAnnotations", () => {
  it("parses emotion + action", () => {
    const r = parseAnnotations("[emotion:happy:0.8][action:greeting] こんにちは！");
    expect(r.emotion).toEqual({ type: "happy", intensity: 0.8 });
    expect(r.action).toBe("greeting");
    expect(r.text).toBe("こんにちは！");
  });

  it("parses emotion only", () => {
    const r = parseAnnotations("[emotion:sad:0.3] 悲しい");
    expect(r.action).toBeNull();
  });

  it("rejects invalid action names", () => {
    const r = parseAnnotations("[emotion:neutral:0.0][action:dance] テスト");
    expect(r.action).toBeNull();
  });
});
```

#### 変更ファイル

**新規**:
- `animation/motion-clip-layer.ts` — AnimationMixer ベースのクリップ再生レイヤー
- `animation/motion-clip-layer.test.ts` — テスト
- `public/motions/*.vrma` — モーションクリップファイル (7 + 3)

**変更**:
- `package.json` — `@pixiv/three-vrm-animation` 追加
- `animation/types.ts` — `LayerOutput` に `lockedBones`, `AnimationContext` に `action`
- `animation/compositor.ts` — `lockedBones` による bone 出力の排他制御
- `AituberAvatar.tsx` — MotionClipLayer 初期化、クリッププリロード
- `use-aituber-store.ts` — `pendingAction` state + `"action"` イベントハンドラ
- `aituber-ai-service.ts` — `parseAnnotations()` に action パース統合、`buildSystemPrompt()` に action 指示
- `contracts/index.ts` — `AituberDataEvent` に `action` イベント追加

---

## 実装順序

```
Batch 1 (致命的修正)
  1-A: Expression 干渉の実機検証 → Case A/B 判定
  1-B: LipSync 帯域計算修正
  1-C: Emotion ライフサイクル
    ↓
Batch 2 (品質向上) — Batch 1 完了後
  2-A: Noise/fbm
  2-B: 呼吸振幅
  2-C: 視線ドリフト
  2-D: Quaternion 化
  2-E: Race condition
    ↓
Batch 3 (バックエンド) — Batch 1/2 と並行可能
  3-A: LLM structured output emotion + action (detectEmotion 完全削除)
    ↓
Batch 4 (モーションクリップ) — Batch 2 + 3 完了後
  4-A: MotionClipLayer + @pixiv/three-vrm-animation 導入
  4-B: 基本リアクションクリップ 7 種の作成/取得 + プリロード
  4-C: アイドルバリエーション 3 種
```

## 全変更ファイル一覧

### フロントエンド変更

| ファイル | Batch | 変更内容 |
|---------|-------|---------|
| `animation/types.ts` | 1-B | `AnimationContext` に `audioSampleRate`, `visemes` |
| `animation/compositor.ts` | 1-A, 1-C, 2-D | override 検証/対応, face max マージ, quaternion |
| `animation/lip-sync-layer.ts` | 1-B | viseme タイムスタンプ方式 + 帯域フォールバック |
| `animation/emotion-layer.ts` | 1-C | hold timer + internal fadeout |
| `animation/noise.ts` | 2-A | `fbm1D` 追加 |
| `animation/idle-motion-layer.ts` | 2-A | fbm 切替 |
| `animation/breathing-layer.ts` | 2-B | 振幅 4x + 3 ボーン連動 |
| `animation/look-at-layer.ts` | 2-C | fbm, 状態別視線, Z 座標修正 |
| `AituberAvatar.tsx` | 1-B, 2-D, 2-E | sampleRate/visemes props, setThree, AbortController |
| `AituberStage.tsx` | 1-B | fftSize=512, sampleRate/visemes 伝達 |
| `use-aituber-store.ts` | 1-B | tts-audio イベントの viseme データ保持 |

### バックエンド変更

| ファイル | Batch | 変更内容 |
|---------|-------|---------|
| `aituber-tts-service.ts` | 1-B | TTS viseme タイムスタンプ取得 |
| `aituber-ai-service.ts` | 3-A | `detectEmotion` 完全削除, `parseAnnotations` 新規 (emotion+action), `buildSystemPrompt` に annotation 指示追加 |
| `contracts/index.ts` | 1-B, 4-A | `tts-audio` に `visemes`, `AituberDataEvent` に `action` |

### 新規ファイル

| ファイル | Batch | 内容 |
|---------|-------|------|
| `animation/motion-clip-layer.ts` | 4-A | AnimationMixer ベースのクリップ再生レイヤー |
| `public/motions/*.vrma` | 4-B, 4-C | モーションクリップファイル (10 種) |

### テスト新規

| ファイル | Batch | 内容 |
|---------|-------|------|
| `animation/compositor.test.ts` | 1-A | expression clamp, merge, lerp, override |
| `animation/lip-sync-layer.test.ts` | 1-B | bin 計算, 無音時 zero, EMA |
| `animation/emotion-layer.test.ts` | 1-C | hold timer, fadeout, blink 非干渉 |
| `animation/motion-clip-layer.test.ts` | 4-A | 無再生時空出力, lockedBones, フェードアウト |
| `aituber-ai-service.test.ts` (追記) | 3-A | `parseAnnotations` パース (emotion+action), clamp, 無効タグ |

## 検証方法

### 自動テスト (regression 防止)

各 Batch のテストファイルに記載のユニットテスト。
expression/bone 出力値のスナップショットアサーション:

```typescript
// 例: compositor の expression merge テスト
expect(compositor.getExpressionValue("happy")).toBeCloseTo(0.6, 1);
expect(compositor.getExpressionValue("blink")).toBe(0); // override で抑制された場合
```

### 手動検証 (Batch 完了時)

| Batch | 検証手順 |
|-------|---------|
| 1 | thinking 中のまばたきで顔が崩れない、TTS 中に複数口形状が見える、emotion が 5 秒後に消える |
| 2 | アイドルモーション 30 秒で周期性なし、呼吸が視認可能、avatarUrl 切替で leak なし |
| 3 | LLM が `[emotion:happy:0.7][action:nod]` タグを出力し、パース後テキストにタグが残らない |
| 4 | 挨拶時にお辞儀クリップが再生され、同時に口は lip sync で動いている |
| 全体 | `pnpm typecheck` 全パス, `npx biome check` エラー 0, `npx vitest run` 全パス |

## SOTA との差分（本計画スコープ外）

本計画完了後も SOTA に届かない項目。別計画として管理:

1. **顔トラッキング**: MediaPipe Face Mesh による配信者表情キャプチャ
2. **ダンス/パフォーマンス**: 長尺モーションの再生・振り付け連携
3. **ニューラル Co-Speech Gesture**: LLM Gesticulator (arXiv:2410.10851) のような
   音声→全身ジェスチャーのリアルタイム生成（現在はプリベイクモーションクリップ方式）
4. **ニューラル LipSync**: SAiD (arXiv:2401.08655) のような Diffusion ベースの
   音声→blendshape 直接生成（ONNX/WASM でブラウザ推論する場合）

## 参考文献

- [TalkingHead - met4citizen/TalkingHead](https://github.com/met4citizen/TalkingHead) — ブラウザ JS リアルタイム lip-sync、viseme タイムスタンプ方式
- [SAiD: Speech-driven Blendshape Facial Animation with Diffusion](https://arxiv.org/abs/2401.08655) — Diffusion ベース blendshape 生成
- [Audio2Face-3D](https://arxiv.org/abs/2508.16401) — ARKit blendshape リアルタイム生成
- [SynchroRaMa](https://arxiv.org/abs/2509.19965) — マルチモーダル emotion embedding
- [LLM Gesticulator](https://arxiv.org/abs/2410.10851) — LLM ベース co-speech ジェスチャー生成
- [LLM for Virtual Human Gesture Selection](https://arxiv.org/abs/2503.14408) — LLM によるジェスチャー選択 (AAMAS 2025)
- [Semantic Gesticulator](https://arxiv.org/abs/2405.09814) — セマンティクス認識 co-speech ジェスチャー (SIGGRAPH 2024)
- [Audio Driven Real-Time Facial Animation for Social Telepresence](https://arxiv.org/abs/2510.01176) — リアルタイム音声駆動顔アニメーション
- [Teller: Real-Time Streaming Audio-Driven Portrait Animation](https://arxiv.org/abs/2503.18429) — ストリーミング音声駆動アニメーション
