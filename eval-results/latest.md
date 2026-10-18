# Eval report

Model run at 2026-10-18T19:41:43.909Z

**Accuracy: 1/1 (100%)**

| scenario | result | time | review rounds | classified | agentsAgree | hebrewClean | hasPlan | noRawHighRisk | saved | noError |
|---|---|---|---|---|---|---|---|---|---|---|
| none | PASS | 31.8s | 1 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Reviewer sanity

**2/3** correct verdicts

| case | expected | got | result |
|---|---|---|---|
| wrong: blames the database while the bank gateway failed | challenge | challenge | PASS |
| wrong: claims an outage while everything is 200 | challenge | challenge | PASS |
| correct: bank gateway 502 | approved | challenge | FAIL |
