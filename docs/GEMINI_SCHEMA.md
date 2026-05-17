# Gemini 분석 스키마 및 프롬프트 계약

## 1. 목적

Gemini는 AI 거짓말탐지기의 최종 판정관 역할을 한다.

입력:

- 전체 세션 영상 1 FPS
- 진짜 질문 구간 5 FPS
- 질문 정보
- transcript
- 브라우저 로컬 feature JSON

출력:

- 유저에게 공개할 `진실` 또는 `거짓`
- roast comment
- 공유/내보내기용 문구
- 운영용 private diagnostics

## 2. 절대 규칙

1. `headline`은 `진실` 또는 `거짓`만 가능하다.
2. `headline`에는 다른 단어, 숫자, 확률, 문장부호를 붙이지 않는다.
3. 공개 필드에는 확률, 가능성, confidence를 쓰지 않는다.
4. 공개 필드에는 감지 신호를 쓰지 않는다.
5. 공개 필드에는 어떤 행동이 수상했는지 쓰지 않는다.
6. 질문은 공유 결과에 공개한다.
7. 감지 신호는 private diagnostics에만 저장한다.
8. 결과가 애매해도 공개 verdict는 `진실` 또는 `거짓` 중 하나여야 한다.
9. 품질이 너무 낮으면 `quality_gate.status = "retry"`로 출력하고, 공개 verdict를 만들지 않는다.
10. 욕설은 피하되 조롱 톤은 강하게 유지한다.

## 3. JSON Schema

```json
{
  "type": "object",
  "properties": {
    "schema_version": {
      "type": "integer",
      "enum": [1]
    },
    "quality_gate": {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": ["pass", "retry"]
        },
        "retry_reason": {
          "type": "string",
          "enum": [
            "none",
            "face_not_visible",
            "audio_missing",
            "answer_too_short",
            "lighting_too_poor",
            "recording_corrupted"
          ]
        },
        "retry_message": {
          "type": "string"
        }
      },
      "required": ["status", "retry_reason", "retry_message"]
    },
    "public_result": {
      "type": "object",
      "properties": {
        "headline": {
          "type": "string",
          "enum": ["진실", "거짓"]
        },
        "verdict": {
          "type": "string",
          "enum": ["truth", "lie"]
        },
        "roast_comment": {
          "type": "string",
          "minLength": 12,
          "maxLength": 120
        },
        "share_question": {
          "type": "string",
          "minLength": 1,
          "maxLength": 160
        },
        "share_text": {
          "type": "string",
          "minLength": 1,
          "maxLength": 180
        },
        "result_card_lines": {
          "type": "array",
          "minItems": 3,
          "maxItems": 3,
          "items": {
            "type": "string",
            "maxLength": 80
          }
        },
        "export_final_frame": {
          "type": "object",
          "properties": {
            "title": {
              "type": "string",
              "enum": ["AI 거짓말탐지기"]
            },
            "question": {
              "type": "string",
              "minLength": 1,
              "maxLength": 160
            },
            "headline": {
              "type": "string",
              "enum": ["진실", "거짓"]
            }
          },
          "required": ["title", "question", "headline"]
        }
      },
      "required": [
        "headline",
        "verdict",
        "roast_comment",
        "share_question",
        "share_text",
        "result_card_lines",
        "export_final_frame"
      ]
    },
    "private_diagnostics": {
      "type": "object",
      "properties": {
        "internal_score": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100
        },
        "internal_confidence": {
          "type": "string",
          "enum": ["low", "medium", "high"]
        },
        "model_reasoning_summary": {
          "type": "string",
          "maxLength": 1000
        },
        "quality": {
          "type": "object",
          "properties": {
            "camera": {
              "type": "string",
              "enum": ["poor", "usable", "good"]
            },
            "audio": {
              "type": "string",
              "enum": ["poor", "usable", "good"]
            },
            "face_visible": {
              "type": "boolean"
            },
            "answer_detected": {
              "type": "boolean"
            },
            "feature_payload_usable": {
              "type": "boolean"
            }
          },
          "required": [
            "camera",
            "audio",
            "face_visible",
            "answer_detected",
            "feature_payload_usable"
          ]
        },
        "segment_judgments": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "segment": {
                "type": "string",
                "enum": ["warmup", "target"]
              },
              "usable": {
                "type": "boolean"
              },
              "internal_notes": {
                "type": "string",
                "maxLength": 500
              }
            },
            "required": ["segment", "usable", "internal_notes"]
          }
        }
      },
      "required": [
        "internal_score",
        "internal_confidence",
        "model_reasoning_summary",
        "quality",
        "segment_judgments"
      ]
    },
    "policy_flags": {
      "type": "object",
      "properties": {
        "contains_probability_in_public_text": {
          "type": "boolean",
          "enum": [false]
        },
        "contains_detection_signal_in_public_text": {
          "type": "boolean",
          "enum": [false]
        },
        "headline_is_exact": {
          "type": "boolean",
          "enum": [true]
        }
      },
      "required": [
        "contains_probability_in_public_text",
        "contains_detection_signal_in_public_text",
        "headline_is_exact"
      ]
    }
  },
  "required": [
    "schema_version",
    "quality_gate",
    "public_result",
    "private_diagnostics",
    "policy_flags"
  ]
}
```

## 4. System Prompt 초안

```text
당신은 "AI 거짓말탐지기"의 멀티모달 분석 모델입니다.

입력으로 전체 검사 영상, 진짜 질문 구간 고 FPS 영상 파트, 질문/답변 transcript, 브라우저에서 추출한 feature JSON을 받습니다.

당신의 목표는 사용자가 묻는 핵심 질문에 대한 답변을 엔터테인먼트 서비스 결과로 판정하는 것입니다.

출력은 반드시 단일 JSON 객체입니다. Markdown, 설명문, 접두사, 접미사를 붙이지 마세요.

절대 규칙:
- 공개 결과 headline은 반드시 "진실" 또는 "거짓" 중 하나만 출력합니다.
- 공개 결과 headline에 다른 단어, 숫자, 확률, 문장부호를 붙이지 않습니다.
- 공개 결과에는 가능성, 확률, confidence, 내부 점수를 쓰지 않습니다.
- 공개 결과에는 감지 신호를 쓰지 않습니다.
- 공개 결과에는 어떤 행동, 표정, 시선, 음성, 답변 패턴이 수상했는지 쓰지 않습니다.
- 질문은 공개 결과와 공유 문구에 포함합니다.
- roast_comment는 심하게 놀리되 심한 욕설은 쓰지 않습니다.
- 품질이 너무 낮으면 quality_gate.status를 "retry"로 설정합니다.
- 품질이 충분하면 quality_gate.status를 "pass"로 설정하고 public_result를 채웁니다.

분석 기준:
- 전체 영상 1 FPS 파트는 검사 전체 흐름, 질문 전환, 표정의 큰 변화, 답변 태도를 이해하는 데 사용합니다.
- 진짜 질문 5 FPS 파트는 핵심 질문 구간의 세밀한 움직임과 반응 타이밍을 이해하는 데 사용합니다.
- feature JSON은 빠른 얼굴 움직임, blink, gaze, head pose, 음성 리듬, rPPG 품질을 보강하는 참고 자료입니다.
- transcript는 답변의 직접성, 회피성, 내부 일관성, 질문과의 관련성을 판단하는 데 사용합니다.

공개 문구 톤:
- 한국어 인터넷식 유머와 조롱 톤을 씁니다.
- 심한 욕설은 쓰지 않습니다.
- 결과는 짧고 세게 씁니다.
- 질문과 진행 UI는 반말 톤을 기준으로 합니다.
- roast_comment는 아래 예시처럼 심하게 놀리되, 결과 근거를 직접 말하지 않습니다.
- 단, 감지 신호를 직접 설명하지 마세요.

결과가 애매할 때:
- 공개 결과는 그래도 "진실" 또는 "거짓" 중 하나로 결정합니다.
- private_diagnostics.internal_confidence에 low/medium/high를 기록합니다.
- 공개 문구에는 애매함이나 확률을 드러내지 않습니다.
```

## 5. 공개 문구 예시

### 5.1 진실

```json
{
  "headline": "진실",
  "verdict": "truth",
  "roast_comment": "보기와는 다르게 생각보다 정직하신 편이네요.",
  "share_text": "질문: 어제 밤 10시 이후에 이성이랑 단둘이 있었어? / 판정: 진실"
}
```

### 5.2 거짓

```json
{
  "headline": "거짓",
  "verdict": "lie",
  "roast_comment": "구라도 실력입니다 선생님. 조금 더 노력하세요.",
  "share_text": "질문: 어제 밤 10시 이후에 이성이랑 단둘이 있었어? / 판정: 거짓"
}
```

## 6. 금지 공개 문구 예시

아래 문구는 공개 필드에 나오면 실패다.

- "거짓 가능성 78%"
- "시선이 흔들렸습니다."
- "심박이 올라갔습니다."
- "목소리 떨림이 감지됐습니다."
- "확률상 거짓입니다."
- "confidence: high"
- "수상한 신호 3개"

## 7. App in Toss/Polar 호환

Gemini 결과는 결제 시스템과 분리한다. 결제 adapter가 무엇이든 결과 구조는 동일하다.

- MVP: 결제 없음
- Polar: 크레딧 차감 후 분석
- 앱인토스 IAP: 소모성 이용권 차감 후 분석
- 앱인토스 광고: 보상형 광고 완료 후 분석권 지급
