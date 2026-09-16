"""
DEV-ONLY, RUN ONCE. Not application code, not part of the build, never bundled.

Generates tests/fixtures/python_reference_output.json by running the validated
Python reference implementation (from the Stride proof-of-concept) over the
bundled sample export. tests/buildDashboardData.parity.test.ts then asserts the
TypeScript port reproduces it — which is the evidence for REQUIREMENTS.md
TR-3 and TR-4.

The fixture is committed, so the test suite never needs Python or the PoC. You
only need to re-run this if the reference implementation itself changes.

Usage:
    python3 scripts/generate_parity_fixture.py [path/to/classification_reference.py]
"""

import importlib.util
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_REFERENCE = Path("/Users/alexyovev/projects/stride/classification_reference.py")
SAMPLE_CSV = REPO / "public" / "sample" / "sugarwod-sample-export.csv"
OUT = REPO / "tests" / "fixtures" / "python_reference_output.json"


def load_reference(path: Path):
    spec = importlib.util.spec_from_file_location("classification_reference", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Could not load the reference implementation at {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    ref_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_REFERENCE
    if not ref_path.exists():
        raise SystemExit(
            f"Reference implementation not found at {ref_path}.\n"
            "It lives in the Stride PoC. The generated fixture is committed, so "
            "you only need this script to regenerate it."
        )

    import pandas as pd

    ref = load_reference(ref_path)
    # dtype=str so pandas doesn't coerce e.g. best_result_raw to float and
    # change what the reference sees relative to what PapaParse hands the TS port.
    df = pd.read_csv(SAMPLE_CSV, dtype=str)
    data = ref.build_dashboard_data(df)

    # `overall`/`domain_trends` etc. are plain dicts; `workout_lists` holds
    # lists of lists. Everything is already JSON-safe except numpy scalars,
    # which default=float handles.
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w") as fh:
        json.dump(data, fh, indent=2, sort_keys=True, default=float)

    print(f"Wrote {OUT.relative_to(REPO)}")
    print(f"  rows in:          {len(df)}")
    print(f"  total_logged:     {data['summary']['total_logged']}")
    print(f"  lifts tracked:    {len(data['lifts'])}")
    print(f"  benchmarks:       {len(data['benchmarks'])}")
    print(f"  months:           {len(data['monthly'])}")


if __name__ == "__main__":
    main()
