import re

with open("app/api/edge.py", "r") as f:
    content = f.read()

# For single push
injection_single = """
        pen_id_int = _resolve_pen_id(body.pen_id)
        result = await db.execute(select(Pen).where(Pen.id == pen_id_int).execution_options(ignore_tenant=True))
        pen = result.scalar_one_or_none()
        if pen:
            db.info["tenant_id"] = pen.owner_id

        detection, event, alert"""

content = re.sub(
    r"(\s*)(detection, event, alert, message, pen_id = _build_detection_payload\(body\))",
    r"\1" + injection_single.strip() + r", message, pen_id = _build_detection_payload(body)",
    content,
    count=1
)

# For batch push
injection_batch = """
            if det.pen_id:
                pen_id_int = _resolve_pen_id(det.pen_id)
                result = await db.execute(select(Pen).where(Pen.id == pen_id_int).execution_options(ignore_tenant=True))
                pen = result.scalar_one_or_none()
                if pen:
                    db.info["tenant_id"] = pen.owner_id
                    
            detection"""

content = re.sub(
    r"(\s*)(detection, event, alert, message, pen_id = _build_detection_payload\(det\))",
    r"\1" + injection_batch.strip() + r", event, alert, message, pen_id = _build_detection_payload(det)",
    content,
    count=1
)

with open("app/api/edge.py", "w") as f:
    f.write(content)

print("Patch applied to edge.py")
