"""Export three verified local DeepEye-SQL runs for the static portfolio preview.

Usage: python deepeye-sql/build_cases.py <path-to-DeepEye-SQL>
Only public display fields are written. Local paths, credentials, prompts and raw
run artifacts remain in the source checkout.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys


RUNS = [
    (0, "df3e55ae694448148079e36ed2638972", "免费餐比例", "口径理解：Alameda County 的 K-12 学生"),
    (2, "509f749d7c6f409599a787b91837523d", "特许学校邮编", "条件过滤：Fresno County Office of Education"),
    (5, "099c3726d03a476f8708447860a4675c", "虚拟学校统计", "多表关联：学校与 SAT 成绩"),
]

EVIDENCE = {
    0: "Eligible free rate for K-12 = `Free Meal Count (K-12)` / `Enrollment (K-12)`",
    2: "Charter schools refers to `Charter School (Y/N)` = 1 in the table fprm",
    5: "Exclusively virtual refers to Virtual = 'F'",
}


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    source = Path(sys.argv[1]).resolve()
    sys.path.insert(0, str(source))
    from app.demo.serializers import serialize_skill_result
    from app.skills import SQLSkillResult

    evaluated = {
        item["question_id"]: item
        for item in json.loads((source / "evals/demo-fast/questions.json").read_text(encoding="utf-8"))
    }
    cases = []
    for question_id, run_id, title, subtitle in RUNS:
        row = evaluated[question_id]
        raw = json.loads(
            (source / "workspace/skill_requests" / run_id / "result.json").read_text(encoding="utf-8")
        )
        shown = serialize_skill_result(SQLSkillResult.model_validate(raw))
        artifacts = shown["artifacts"]
        assert raw["status"] == "success" and row["execution_correct"] and row["multiset_match"]
        assert raw["sql"] == row["predicted_sql"] == artifacts["final_sql"]
        assert len(raw["rows"]) == row["returned_rows"]
        assert all(artifacts[key] for key in ("generated_sql", "revised_sql", "final_sql"))

        chat = raw["usage"]["chat"]
        embedding = raw["usage"]["embedding"]
        cases.append({
            "id": f"question-{question_id}",
            "title": title,
            "subtitle": subtitle,
            "question": row["question"],
            "evidence": EVIDENCE[question_id],
            "database": "California Schools",
            "elapsed_seconds": round(raw["elapsed_seconds"], 2),
            "stage_seconds": {key: round(value, 3) for key, value in raw["stage_seconds"].items()},
            "usage": {
                "total_tokens": chat["total_tokens"] + embedding["total_tokens"],
                "chat_tokens": chat["total_tokens"],
                "embedding_tokens": embedding["total_tokens"],
                "model_responses": chat["responses"] + embedding["responses"],
                "chat_responses": chat["responses"],
            },
            "artifacts": {
                key: artifacts[key]
                for key in (
                    "generated_sql", "revised_sql", "final_sql", "linked_schema",
                    "generated_candidate_count", "revised_candidate_count",
                    "retrieved_value_columns", "few_shot_example_count",
                )
            },
            "columns": raw["columns"],
            "rows": raw["rows"],
            "execution_correct": True,
            "multiset_match": True,
        })

    output = {
        "kind": "recorded-run-preview",
        "recorded_on": "2026-10-26",
        "source_repository": "https://github.com/liunian66666/text2Sql",
        "evaluation_report": "https://github.com/liunian66666/text2Sql/blob/master/evals/demo-fast/report.md",
        "cases": cases,
    }
    destination = Path(__file__).with_name("cases.json")
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(cases)} verified cases to {destination}")


if __name__ == "__main__":
    main()
