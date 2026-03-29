import re

with open("app/models/pig.py", "r") as f:
    content = f.read()

# Add TenantAware definition near the top
tenant_mixin = """
class TenantAware:
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)

"""

if "class TenantAware" not in content:
    content = content.replace("from sqlalchemy.orm import relationship", "from sqlalchemy.orm import relationship\nfrom sqlalchemy.orm import declarative_mixin\n\n@declarative_mixin\n" + tenant_mixin)

classes = [
    "Pen", "Sow", "Alert", "Event", "Detection", "BehaviorLog", 
    "TaskTemplate", "Task", "FarrowingRecord", "PigletRecord", 
    "WorkflowRule", "NotificationSubscription", "NotificationLog",
    "RecordingSchedule", "RecordingClip", "StorageStatus"
]

for cls in classes:
    content = re.sub(rf"class {cls}\(Base\):", f"class {cls}(TenantAware, Base):", content)

with open("app/models/pig.py", "w") as f:
    f.write(content)

print("Patch applied to pig.py")
