# Eval report

Model run at 2026-10-18T18:54:59.088Z

**Accuracy: 4/4 (100%)**

| scenario | result | time | review rounds | classified | agentsAgree | hebrewClean | hasPlan | noRawHighRisk | saved | noError |
|---|---|---|---|---|---|---|---|---|---|---|
| none | PASS | 57.3s | 1 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ext_down | PASS | 152.1s | 1 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| db_down | PASS | 139.0s | 1 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| latency | PASS | 107.6s | 1 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Reviewer sanity

**2/3** correct verdicts

| case | expected | got | result |
|---|---|---|---|
| wrong: blames the database while the bank gateway failed | challenge | challenge | PASS |
| wrong: claims an outage while everything is 200 | challenge | challenge | PASS |
| correct: bank gateway 502 | approved | challenge | FAIL |
