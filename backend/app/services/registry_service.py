"""Synchronizes trained ML artifact metadata.json files into the Model Registry table."""

from datetime import datetime
import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.models.model_registry import ModelRegistryEntry


def sync_model_registry(db: Session) -> int:
    """Read `<ml>/<module>/artifacts/metadata.json` and upsert ModelRegistryEntry rows."""
    ml_dir = Path(settings.ML_DIR)
    if not ml_dir.exists():
        return 0

    synced = 0
    for meta_file in ml_dir.glob("*/artifacts/metadata.json"):
        entries = json.loads(meta_file.read_text(encoding="utf-8"))
        if isinstance(entries, dict):
            entries = [entries]

        for entry in entries:
            module = entry["module"]
            sub_model = entry["sub_model"]
            version = entry["version"]
            trained_at = datetime.fromisoformat(entry["trained_at"])

            # Mark older versions of the same module/sub_model inactive if a new version arrives.
            db.query(ModelRegistryEntry).filter(
                ModelRegistryEntry.module == module,
                ModelRegistryEntry.sub_model == sub_model,
                ModelRegistryEntry.version != version,
            ).update({"is_active": False})

            existing = (
                db.query(ModelRegistryEntry)
                .filter(
                    ModelRegistryEntry.module == module,
                    ModelRegistryEntry.sub_model == sub_model,
                    ModelRegistryEntry.version == version,
                )
                .first()
            )

            if existing is None:
                db.add(
                    ModelRegistryEntry(
                        module=module,
                        sub_model=sub_model,
                        model_name=entry["model_name"],
                        version=version,
                        metrics=entry["metrics"],
                        comparison_table=entry["comparison_table"],
                        error_analysis=entry["error_analysis"],
                        limitations=entry["limitations"],
                        thresholds=entry.get("thresholds", {}),
                        artifact_path=entry["artifact_path"],
                        trained_at=trained_at,
                        is_active=True,
                    )
                )
            else:
                existing.model_name = entry["model_name"]
                existing.metrics = entry["metrics"]
                existing.comparison_table = entry["comparison_table"]
                existing.error_analysis = entry["error_analysis"]
                existing.limitations = entry["limitations"]
                existing.thresholds = entry.get("thresholds", {})
                existing.artifact_path = entry["artifact_path"]
                existing.trained_at = trained_at
                existing.is_active = True

            synced += 1

    db.commit()
    return synced
