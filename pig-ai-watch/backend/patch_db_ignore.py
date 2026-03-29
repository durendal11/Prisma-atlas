with open("app/core/database.py", "r") as f:
    content = f.read()

content = content.replace("    if not execute_state.is_orm_statement:", "    if not execute_state.is_orm_statement or execute_state.execution_options.get('ignore_tenant'):")

with open("app/core/database.py", "w") as f:
    f.write(content)
