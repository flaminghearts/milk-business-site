import hashlib
import json
import os
import secrets
import sqlite3
import threading
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data.db"
SESSIONS = {}


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'customer',
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            product TEXT NOT NULL,
            quantity TEXT NOT NULL,
            message TEXT,
            status TEXT NOT NULL DEFAULT 'Pending',
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            price TEXT NOT NULL,
            stock TEXT NOT NULL,
            is_published INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200000).hex()


def ensure_seed_users():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    admin = conn.execute("SELECT id FROM users WHERE email = ?", ("admin@moofresh.com",)).fetchone()
    if admin is None:
        salt = secrets.token_hex(16)
        conn.execute(
            "INSERT INTO users (name, email, phone, password_hash, password_salt, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("Admin Team", "admin@moofresh.com", "+254700000000", hash_password("admin123", salt), salt, "admin", "2026-07-10T00:00:00"),
        )
    customer = conn.execute("SELECT id FROM users WHERE email = ?", ("demo@customer.com",)).fetchone()
    if customer is None:
        salt = secrets.token_hex(16)
        conn.execute(
            "INSERT INTO users (name, email, phone, password_hash, password_salt, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("Demo Customer", "demo@customer.com", "+254700000001", hash_password("customer123", salt), salt, "customer", "2026-07-10T00:00:00"),
        )
    conn.commit()
    conn.close()


def ensure_seed_products():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    count = conn.execute("SELECT COUNT(*) AS count FROM products").fetchone()["count"]
    if count == 0:
        conn.execute(
            "INSERT INTO products (name, description, category, price, stock, is_published, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("Fresh Milk", "Reliable daily milk for homes and offices.", "Fresh", "Kes 120/L", "900L", 1, "2026-07-10T00:00:00"),
        )
        conn.execute(
            "INSERT INTO products (name, description, category, price, stock, is_published, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("Long Life Milk", "Shelf-stable milk for retailers and institutions.", "Long Life", "Kes 180/L", "520L", 1, "2026-07-10T00:00:00"),
        )
    conn.commit()
    conn.close()


class DairyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed.path)
            return
        self.serve_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_post(parsed.path)
            return
        self.send_json(404, {"error": "Not found"})

    def handle_api_get(self, path):
        if path == "/api/me":
            self.send_json(200, self.current_user_payload())
            return
        if path == "/api/orders":
            if not self.require_role("admin"):
                return
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM orders ORDER BY id DESC").fetchall()
            conn.close()
            payload = [{
                "id": row["id"],
                "customerName": row["customer_name"],
                "customerEmail": row["customer_email"],
                "customerPhone": row["customer_phone"],
                "product": row["product"],
                "quantity": row["quantity"],
                "message": row["message"],
                "status": row["status"],
                "createdAt": row["created_at"],
            } for row in rows]
            self.send_json(200, {"orders": payload})
            return
        if path == "/api/products":
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            current_user = self.get_current_user()
            if current_user and current_user.get("role") == "admin":
                rows = conn.execute("SELECT * FROM products ORDER BY id DESC").fetchall()
            else:
                rows = conn.execute("SELECT * FROM products WHERE is_published = 1 ORDER BY id DESC").fetchall()
            conn.close()
            payload = [{
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "category": row["category"],
                "price": row["price"],
                "stock": row["stock"],
                "isPublished": bool(row["is_published"]),
            } for row in rows]
            self.send_json(200, {"products": payload})
            return
        self.send_json(404, {"error": "Not found"})

    def handle_api_post(self, path):
        if path == "/api/auth":
            self.handle_auth()
            return
        if path == "/api/orders":
            self.handle_order_create()
            return
        if path == "/api/products":
            self.handle_product_create()
            return
        if path == "/api/logout":
            self.clear_session()
            self.send_json(200, {"ok": True, "message": "Logged out"})
            return
        self.send_json(404, {"error": "Not found"})

    def handle_auth(self):
        payload = self.read_json_body()
        if not payload:
            self.send_json(400, {"error": "Invalid payload"})
            return
        mode = (payload.get("mode") or "login").lower()
        role = (payload.get("role") or "customer").lower()
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""
        name = (payload.get("name") or "").strip()
        phone = (payload.get("phone") or "").strip()

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        if mode == "register":
            if not email or not password or not name:
                conn.close()
                self.send_json(400, {"error": "Name, email and password are required"})
                return
            existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if existing:
                conn.close()
                self.send_json(409, {"error": "That email is already registered"})
                return
            salt = secrets.token_hex(16)
            conn.execute(
                "INSERT INTO users (name, email, phone, password_hash, password_salt, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (name, email, phone, hash_password(password, salt), salt, role, self.timestamp()),
            )
            conn.commit()
            user_row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        else:
            user_row = conn.execute("SELECT * FROM users WHERE email = ? AND role = ?", (email, role)).fetchone()
            if not user_row or not self.verify_password(password, user_row["password_hash"], user_row["password_salt"]):
                conn.close()
                self.send_json(401, {"error": "Invalid credentials"})
                return
        conn.close()

        if not user_row:
            self.send_json(500, {"error": "Authentication failed"})
            return
        token = secrets.token_hex(24)
        SESSIONS[token] = {
            "id": user_row["id"],
            "name": user_row["name"],
            "email": user_row["email"],
            "phone": user_row["phone"],
            "role": user_row["role"],
        }
        response_body = json.dumps({"ok": True, "user": self.serialize_user(user_row), "message": "Signed in successfully"}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_body)))
        cookie = SimpleCookie()
        cookie["session_token"] = token
        cookie["session_token"]["httponly"] = True
        cookie["session_token"]["path"] = "/"
        cookie["session_token"]["max-age"] = 3600
        self.send_header("Set-Cookie", cookie["session_token"].OutputString())
        self.end_headers()
        self.wfile.write(response_body)

    def handle_order_create(self):
        if not self.require_role("customer"):
            return
        payload = self.read_json_body() or {}
        customer_name = (payload.get("customerName") or "").strip()
        customer_email = (payload.get("customerEmail") or "").strip().lower()
        customer_phone = (payload.get("customerPhone") or "").strip()
        product = (payload.get("customerProduct") or "").strip()
        quantity = (payload.get("customerQuantity") or "").strip()
        message = (payload.get("customerMessage") or "").strip()
        if not all([customer_name, customer_email, customer_phone, product, quantity]):
            self.send_json(400, {"error": "Please complete all required fields"})
            return
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "INSERT INTO orders (customer_name, customer_email, customer_phone, product, quantity, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (customer_name, customer_email, customer_phone, product, quantity, message, "Pending", self.timestamp()),
        )
        conn.commit()
        conn.close()
        self.send_json(200, {"ok": True, "message": "Order request saved successfully"})

    def handle_product_create(self):
        if not self.require_role("admin"):
            return
        payload = self.read_json_body() or {}
        name = (payload.get("name") or payload.get("productName") or "").strip()
        description = (payload.get("description") or payload.get("productDescription") or "").strip()
        category = (payload.get("category") or payload.get("productCategory") or "").strip()
        price = (payload.get("price") or payload.get("productPrice") or "").strip()
        stock = (payload.get("stock") or payload.get("productStock") or "").strip()
        is_published = self.parse_bool(payload.get("isPublished") or payload.get("is_published") or True)
        if not all([name, description, category, price, stock]):
            self.send_json(400, {"error": "Please complete all product fields"})
            return
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.execute(
            "INSERT INTO products (name, description, category, price, stock, is_published, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (name, description, category, price, stock, is_published, self.timestamp()),
        )
        product_id = cursor.lastrowid
        row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        conn.commit()
        conn.close()
        self.send_json(200, {"ok": True, "product": {
            "id": row[0],
            "name": row[1],
            "description": row[2],
            "category": row[3],
            "price": row[4],
            "stock": row[5],
            "isPublished": bool(row[6]),
        }, "message": "Product added successfully"})

    def require_role(self, role):
        user = self.get_current_user()
        if not user or user.get("role") != role:
            self.send_json(401, {"error": "Authentication required"})
            return None
        return user

    def current_user_payload(self):
        user = self.get_current_user()
        if not user:
            return {"authenticated": False}
        return {"authenticated": True, "user": user}

    def get_current_user(self):
        cookies = SimpleCookie(self.headers.get("Cookie", ""))
        token = cookies.get("session_token")
        if not token:
            return None
        token = token.value
        return SESSIONS.get(token)

    def set_cookie(self, name, value):
        cookie = SimpleCookie()
        cookie[name] = value
        cookie[name]["httponly"] = True
        cookie[name]["path"] = "/"
        cookie[name]["max-age"] = 3600
        self.send_header("Set-Cookie", cookie[name].OutputString())

    def clear_session(self):
        cookies = SimpleCookie(self.headers.get("Cookie", ""))
        token = cookies.get("session_token")
        if token:
            SESSIONS.pop(token.value, None)

    def verify_password(self, password, stored_hash, salt):
        return hash_password(password, salt) == stored_hash

    def parse_bool(self, value):
        if isinstance(value, bool):
            return 1 if value else 0
        if isinstance(value, (int, float)):
            return 1 if int(value) else 0
        if isinstance(value, str):
            return 1 if value.strip().lower() in {"1", "true", "yes", "on"} else 0
        return 1

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        try:
            return json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return {}

    def serialize_user(self, row):
        return {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "phone": row["phone"],
            "role": row["role"],
        }

    def timestamp(self):
        from datetime import datetime
        return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    def serve_static(self, path):
        safe_path = path.lstrip("/") or "index.html"
        if safe_path.startswith("api"):
            self.send_json(404, {"error": "Not found"})
            return
        candidate = (ROOT / safe_path).resolve()
        if not str(candidate).startswith(str(ROOT)):
            self.send_json(403, {"error": "Forbidden"})
            return
        if not candidate.exists() or not candidate.is_file():
            self.send_json(404, {"error": "Not found"})
            return
        content_type = "text/html"
        if candidate.suffix == ".css":
            content_type = "text/css"
        elif candidate.suffix == ".js":
            content_type = "application/javascript"
        elif candidate.suffix == ".json":
            content_type = "application/json"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(candidate.read_bytes())

    def send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    init_db()
    ensure_seed_users()
    ensure_seed_products()
    server = ThreadingHTTPServer(("0.0.0.0", 8000), DairyHandler)
    print("Serving MooFresh Dairy on http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
