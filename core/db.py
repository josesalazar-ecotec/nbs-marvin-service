import mysql.connector
import os

def get_connection():
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        database="agente_po_v2",
        user=os.getenv("MYSQL_USER", "nbs_app"),
        password=os.getenv("MYSQL_PASSWORD"),
        charset="utf8mb4",
        autocommit=False
    )
