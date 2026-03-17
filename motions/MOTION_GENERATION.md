# AITuber モーションクリップ生成指示書

## 用途

VRM 3D アバターによる AITuber 配信用モーションクリップ。
LLM が応答内容に応じてクリップを選択し、リアルタイムで再生する。
LLM は `[emotion:TYPE:INTENSITY]` で感情の強度を 0.0-1.0 で出力しており、
それに対応する intensity tier のモーションを選択する。

## カメラ構図

バストアップ（腰上）正面。カメラ位置 `(0, 1.3, 1.5)` → `(0, 1.0, 0)` 注視。
**上半身の動き（手・腕・頭・肩）が最重要。脚はカメラに映らない。**

## 技術制約

- スケルトン: SMPL-H 22 joints → VRM Humanoid にリターゲット
- 出力: FBX (30fps) → fbx2vrma-converter で VRMA 変換
- 開始姿勢: 自然な直立（T-pose ではない）
- 非ループ: 必ず自然な直立に戻って終了
- ループ: 開始と終了が同一姿勢
- 顔の表情は含めない（別系統で制御）。ボディモーションのみ

## 品質基準

- 人間の重心移動・慣性を感じる自然な動き。ロボット的にしない
- VTuber は控えめ。振幅は抑えめに
- 動作ピークはクリップ前半 1/3、残り 2/3 で滑らかに戻る
- お辞儀は 15-30 度（日本文化。45 度は過剰）

## Intensity 設計

感情系カテゴリ (laugh, surprise, sad, angry, reaction) は 5 段階の intensity tier を持つ:

| Tier | intensity 範囲 | 動きの振幅 | 説明 |
|------|---------------|-----------|------|
| low | 0.0-0.2 | 微小 | かすかに感じ取れる程度。肩や頭のわずかな動き |
| low-mid | 0.2-0.4 | 控えめ | 自然な日常の反応。視聴者が気づく程度 |
| mid | 0.4-0.6 | 標準 | 明確な感情表現。VTuber らしい程よい動き |
| mid-high | 0.6-0.8 | やや大きめ | 強い感情。上半身全体が連動 |
| high | 0.8-1.0 | 最大 | 全力の感情表現。大きなジェスチャー |

## ライセンス

HY-Motion 1.0 outputs は Tencent Hunyuan Community License に従う。
利用地域制限（EU/英国/韓国除外）、MAU 100 万超で別途許諾要。
利用者の判断のもと使用すること。

---

## クリップ定義

### greeting（挨拶）— 8 クリップ

| ID | プロンプト | 秒 | ループ |
|----|----------|-----|--------|
| greeting-bow-polite | A person bows politely from the waist with hands together at front, gentle forward lean 30 degrees then returns to standing | 2.0 | No |
| greeting-bow-casual | A person gives a quick casual nod-bow, slight forward lean with relaxed posture | 1.5 | No |
| greeting-bow-deep | A person bows deeply from the waist at 45 degrees, very formal and respectful, slow return | 2.5 | No |
| greeting-wave-big | A person waves right hand enthusiastically high above head, cheerful energy | 2.0 | No |
| greeting-wave-casual | A person waves right hand casually at shoulder height with a slight head tilt to the right | 2.0 | No |
| greeting-hand-raise | A person raises right hand briefly in a casual hello gesture, relaxed | 1.2 | No |
| farewell-wave | A person waves goodbye with right hand at chest height, gentle smile implied, slight forward lean | 2.0 | No |
| farewell-bow | A person gives a parting bow with a brief nod, hands at sides, respectful goodbye | 1.5 | No |

### nod（うなずき・同意）— 8 クリップ

| ID | プロンプト | 秒 | ループ |
|----|----------|-----|--------|
| nod-gentle-1 | A person nods gently once, slight forward head movement, natural and subtle | 0.8 | No |
| nod-gentle-2 | A person nods softly with a slight tilt to the right side, casual agreement | 0.8 | No |
| nod-deep | A person nods deeply with eyes closing briefly, whole upper body follows the movement, strong agreement | 1.2 | No |
| nod-continuous | A person nods rapidly three times in enthusiastic agreement, energy in the movement | 1.5 | No |
| nod-with-tilt | A person nods once while tilting head to the side thoughtfully, considering | 1.0 | No |
| nod-slow | A person nods very slowly once, deliberate and serious, showing deep understanding | 1.5 | No |
| head-tilt-curious | A person tilts head to the right side curiously, slight lean forward, interested | 1.0 | No |
| head-shake-gentle | A person shakes head gently side to side, mild disagreement or disbelief, subtle | 1.2 | No |

### laugh（笑い）— 5 intensity tiers + 3 style variants = 8 クリップ

| ID | プロンプト | 秒 | ループ | Tier |
|----|----------|-----|--------|------|
| laugh-low | A person exhales with amusement through the nose, shoulders barely moving, contained smile | 1.5 | No | low |
| laugh-low-mid | A person chuckles softly, slight shoulder bounce, one hand moves near mouth briefly | 1.8 | No | low-mid |
| laugh-mid | A person laughs naturally with clear shoulder movement, head tilting back slightly | 2.0 | No | mid |
| laugh-mid-high | A person laughs heartily with shoulders shaking, noticeable lean back, hand on chest | 2.5 | No | mid-high |
| laugh-high | A person bursts into full laughter, upper body rocking back, both shoulders shaking vigorously, one hand slapping knee | 3.0 | No | high |
| laugh-shy | A person laughs shyly, looking down and away with hand covering mouth, embarrassed | 2.0 | No | mid |
| laugh-wry | A person gives a wry half-laugh, one shoulder shrugs up briefly, head tilts to one side, resigned amusement | 1.5 | No | low-mid |
| laugh-stifled | A person tries to hold back laughter, shoulders trembling with suppressed amusement, hand pressed over mouth | 2.0 | No | mid |

### surprise（驚き）— 5 intensity tiers = 5 クリップ

| ID | プロンプト | 秒 | ループ | Tier |
|----|----------|-----|--------|------|
| surprise-low | A person blinks and pulls chin back slightly, subtle double-take, minimal body movement | 1.0 | No | low |
| surprise-low-mid | A person leans back slightly with eyebrows rising, mild surprise, hands stay at sides | 1.2 | No | low-mid |
| surprise-mid | A person leans back noticeably, one hand rises to chest level instinctively, clear surprise | 1.5 | No | mid |
| surprise-mid-high | A person steps back with both hands rising to shoulder height, visible shock on body | 1.5 | No | mid-high |
| surprise-high | A person jolts back sharply with both hands up near face, dramatic shock, full upper body recoil | 1.8 | No | high |

### sad（悲しみ）— 5 intensity tiers + 2 style variants = 7 クリップ

| ID | プロンプト | 秒 | ループ | Tier |
|----|----------|-----|--------|------|
| sad-low | A person's posture sinks slightly, shoulders dropping just barely, subdued mood | 2.0 | No | low |
| sad-low-mid | A person looks down slightly with softened posture, quiet disappointment | 2.0 | No | low-mid |
| sad-mid | A person looks down sadly with noticeably slumped shoulders, dejected stance | 2.5 | No | mid |
| sad-mid-high | A person droops heavily, head hanging down, arms limp at sides, deep sadness | 2.5 | No | mid-high |
| sad-high | A person covers face with both hands, shoulders trembling slightly, overwhelmed with emotion | 3.0 | No | high |
| sad-sigh | A person sighs deeply, shoulders dropping on exhale, resigned disappointment | 2.5 | No | mid |
| sad-look-away | A person turns face away to the side, one hand touching opposite arm, withdrawing | 2.0 | No | low-mid |

### angry（怒り）— 5 intensity tiers + 2 style variants = 7 クリップ

| ID | プロンプト | 秒 | ループ | Tier |
|----|----------|-----|--------|------|
| angry-low | A person's jaw tightens subtly, posture stiffens almost imperceptibly, contained irritation | 1.5 | No | low |
| angry-low-mid | A person crosses arms slowly with a slightly tense posture, mild displeasure | 2.0 | No | low-mid |
| angry-mid | A person clenches fists at sides with visibly tense shoulders, clear frustration | 1.5 | No | mid |
| angry-mid-high | A person leans forward aggressively, fists tight, shoulders raised, strong anger | 1.5 | No | mid-high |
| angry-high | A person slams one fist into open palm forcefully, whole body tense, furious stance | 1.8 | No | high |
| angry-sigh | A person exhales sharply through nose, head drops briefly then snaps back up, exasperated | 1.5 | No | low-mid |
| angry-arms-crossed | A person crosses arms tightly and leans back, chin slightly raised, defiant displeasure | 2.0 | No | mid |

### think（考える）— 5 クリップ

| ID | プロンプト | 秒 | ループ |
|----|----------|-----|--------|
| think-chin-hand | A person rests chin on right hand thoughtfully, looking slightly upward, contemplative | 3.0 | Yes |
| think-arms-crossed | A person crosses arms and tilts head slightly, deep in thought, serious expression | 3.0 | Yes |
| think-head-scratch | A person scratches the back of head with right hand, puzzled and uncertain | 2.0 | No |
| think-look-up | A person looks upward to the right, index finger touching temple, searching for an answer | 2.5 | Yes |
| think-fidget | A person taps chin with index finger repeatedly, mulling something over, restless thought | 2.5 | Yes |

### explain（説明・プレゼン）— 6 クリップ

| ID | プロンプト | 秒 | ループ |
|----|----------|-----|--------|
| explain-hands-forward | A person gestures with both hands forward, palms up, explaining something patiently | 2.0 | No |
| explain-point | A person points forward with right index finger for emphasis, assertive but not aggressive | 1.5 | No |
| explain-hands-spread | A person spreads both hands wide apart, presenting a big idea, open welcoming gesture | 2.0 | No |
| explain-count-fingers | A person raises hand and counts by extending fingers one at a time, listing points | 2.5 | No |
| explain-hands-together | A person brings both hands together in front of chest, fingertips touching, organizing thoughts | 1.5 | No |
| explain-one-hand-wave | A person gestures casually with one hand while explaining, relaxed conversational style | 2.0 | No |

### reaction（リアクション）— 感情横断的な反応 — 8 クリップ

| ID | プロンプト | 秒 | ループ |
|----|----------|-----|--------|
| react-impressed | A person leans back slightly with a slow nod, hands at sides, genuinely impressed and admiring | 1.5 | No |
| react-confused | A person tilts head and raises one hand palm-up in a questioning gesture, clearly puzzled | 1.5 | No |
| react-embarrassed | A person touches back of neck with one hand and looks slightly down and away, flustered | 2.0 | No |
| react-relieved | A person exhales visibly, shoulders dropping from tension, hand on chest, wave of relief | 2.0 | No |
| react-excited | A person does a small fist pump near chest, slight bounce in posture, contained excitement | 1.5 | No |
| react-sympathetic | A person places one hand over heart and nods slowly, showing deep empathy and concern | 2.0 | No |
| react-grateful | A person brings both hands together at chest in a brief prayer-like gesture, bowing head slightly, thankful | 1.5 | No |
| react-determined | A person clenches one fist at chest height and nods firmly once, resolute expression, ready to act | 1.5 | No |

### idle（アイドル）— 視聴者が最長時間見る。自然さ最重要 — 7 クリップ

| ID | プロンプト | 秒 | ループ |
|----|----------|-----|--------|
| idle-shift-1 | A person shifts weight subtly from left to right foot in a natural standing transition | 3.0 | No |
| idle-shift-2 | A person shifts weight with slight hip sway, very relaxed standing posture | 3.0 | No |
| idle-stretch | A person does a light stretch raising both arms overhead briefly then relaxes back to standing | 3.5 | No |
| idle-look-around | A person looks left then right casually with slight upper body turn, curious and relaxed | 3.0 | No |
| idle-hair-touch | A person touches hair behind right ear, a natural fidgeting gesture while standing | 2.0 | No |
| idle-arms-adjust | A person adjusts arm position, switching from arms at sides to one hand holding the other wrist in front | 2.5 | No |
| idle-shoulder-roll | A person rolls both shoulders back once slowly, relieving tension, then settles into relaxed stance | 2.5 | No |

---

**合計: 69 クリップ** (greeting 8 + nod 8 + laugh 8 + surprise 5 + sad 7 + angry 7 + think 5 + explain 6 + reaction 8 + idle 7)

## 生成後

```
1. FBX → fbx2vrma-converter で VRMA 変換
2. public/motions/ に配置
3. manifest.json を更新
4. VRM ビューアーで目視確認
```

追加クリップ: このファイルにエントリを追加 → 再生成。
