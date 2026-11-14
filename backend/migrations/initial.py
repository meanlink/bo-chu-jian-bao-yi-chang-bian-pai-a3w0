from sqlalchemy import inspect, text
from src.config.database import Base, engine
# 既有库需要补齐的新增列：表 -> [(列名, 列定义 DDL)]
_EXTRA_COLUMNS = {
    'jobs': [
        ('approval_state', "VARCHAR(20) NOT NULL DEFAULT 'pending'"),
        ('revoked_by', 'VARCHAR(150) NULL'),
        ('revoked_at', 'DOUBLE NULL'),
        ('revoked_reason', 'VARCHAR(500) NULL'),
    ],
    'reports': [
        ('revoked', 'BOOLEAN NOT NULL DEFAULT 0'),
        ('revoked_by', 'VARCHAR(150) NULL'),
        ('revoked_at', 'DOUBLE NULL'),
        ('revoked_reason', 'VARCHAR(500) NULL'),
    ],
    'deliveries': [
        ('revoked', 'BOOLEAN NOT NULL DEFAULT 0'),
        ('revoked_by', 'VARCHAR(150) NULL'),
        ('revoked_at', 'DOUBLE NULL'),
        ('revoked_reason', 'VARCHAR(500) NULL'),
    ],
}
def migrate():
    # 新库：直接按当前模型建表（已包含全部新列）
    Base.metadata.create_all(engine)
    # 旧库：幂等补齐缺失列，并把历史已批准数据回填为 approved
    inspector = inspect(engine)
    existing = {table: {col['name'] for col in inspector.get_columns(table)}
                for table in _EXTRA_COLUMNS if inspector.has_table(table)}
    with engine.begin() as conn:
        for table, columns in _EXTRA_COLUMNS.items():
            if table not in existing:
                continue
            for name, ddl in columns:
                if name not in existing[table]:
                    conn.execute(text(f'ALTER TABLE `{table}` ADD COLUMN `{name}` {ddl}'))
        if inspector.has_table('jobs'):
            # 历史已批准数据回填为 approved；其余保持默认 pending
            conn.execute(text("UPDATE jobs SET approval_state='approved' WHERE approved=1 AND approval_state='pending'"))
if __name__=='__main__':
    migrate()
