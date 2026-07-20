import hashlib
import json
import os
import secrets
import sqlite3
import threading
import re
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data.db"
SESSIONS = {}

# Configuration Loaded from .env
CONFIG = {
    "BASE_URL": "http://127.0.0.1:8000",
    "MPESA_ENV": "sandbox",
    "MPESA_SHORTCODE": "174379",
    "MPESA_PASSKEY": "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
}

def load_env():
    global CONFIG
    env_path = ROOT / ".env"
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    CONFIG[key.strip()] = val.strip()

def parse_price(price_str):
    match = re.search(r'\d+', price_str)
    if match:
        return float(match.group())
    return 120.0  # default fallback price

def parse_quantity(qty_str):
    match = re.search(r'\d+', qty_str)
    if match:
        return float(match.group())
    return 1.0  # default fallback quantity

# --- M-Pesa STK Push API Helpers ---

def get_mpesa_access_token(consumer_key, consumer_secret, env="sandbox"):
    domain = "sandbox.safaricom.co.ke" if env == "sandbox" else "api.safaricom.co.ke"
    url = f"https://{domain}/oauth/v1/generate?grant_type=client_credentials"
    auth_str = f"{consumer_key}:{consumer_secret}"
    auth_bytes = auth_str.encode('utf-8')
    auth_b64 = base64.b64encode(auth_bytes).decode('utf-8')
    
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Basic {auth_b64}")
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data.get("access_token")
    except Exception as e:
        print(f"Error getting M-Pesa access token: {e}")
        return None

def initiate_stk_push(phone, amount, order_id, callback_url, config):
    import base64
    consumer_key = config.get("MPESA_CONSUMER_KEY")
    consumer_secret = config.get("MPESA_CONSUMER_SECRET")
    shortcode = config.get("MPESA_SHORTCODE", "174379")
    passkey = config.get("MPESA_PASSKEY", "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919")
    env = config.get("MPESA_ENV", "sandbox")
    
    access_token = get_mpesa_access_token(consumer_key, consumer_secret, env)
    if not access_token:
        raise Exception("Failed to obtain M-Pesa access token. Check consumer key and secret.")
        
    domain = "sandbox.safaricom.co.ke" if env == "sandbox" else "api.safaricom.co.ke"
    url = f"https://{domain}/mpesa/stkpush/v1/processrequest"
    
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    password_str = f"{shortcode}{passkey}{timestamp}"
    password = base64.b64encode(password_str.encode('utf-8')).decode('utf-8')
    
    # clean phone number to 2547XXXXXXXX or 2541XXXXXXXX
    phone = re.sub(r'\D', '', phone)
    if phone.startswith("0"):
        phone = "254" + phone[1:]
    elif phone.startswith("+"):
        phone = phone[1:]
    elif not phone.startswith("254"):
        phone = "254" + phone
        
    payload = {
        "BusinessShortCode": int(shortcode),
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": int(amount),
        "PartyA": int(phone),
        "PartyB": int(shortcode),
        "PhoneNumber": int(phone),
        "CallBackURL": callback_url,
        "AccountReference": f"Order{order_id}",
        "TransactionDesc": f"Payment for Order {order_id}"
    }
    
    req_body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=req_body, method="POST")
    req.add_header("Authorization", f"Bearer {access_token}")
    req.add_header("Content-Type", "application/json")
    
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

def query_stk_push_status(checkout_request_id, config):
    import base64
    consumer_key = config.get("MPESA_CONSUMER_KEY")
    consumer_secret = config.get("MPESA_CONSUMER_SECRET")
    shortcode = config.get("MPESA_SHORTCODE", "174379")
    passkey = config.get("MPESA_PASSKEY", "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919")
    env = config.get("MPESA_ENV", "sandbox")
    
    access_token = get_mpesa_access_token(consumer_key, consumer_secret, env)
    if not access_token:
        raise Exception("Failed to obtain M-Pesa access token for query.")
        
    domain = "sandbox.safaricom.co.ke" if env == "sandbox" else "api.safaricom.co.ke"
    url = f"https://{domain}/mpesa/stkpushquery/v1/query"
    
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    password_str = f"{shortcode}{passkey}{timestamp}"
    password = base64.b64encode(password_str.encode('utf-8')).decode('utf-8')
    
    payload = {
        "BusinessShortCode": int(shortcode),
        "Password": password,
        "Timestamp": timestamp,
        "CheckoutRequestID": checkout_request_id
    }
    
    req_body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=req_body, method="POST")
    req.add_header("Authorization", f"Bearer {access_token}")
    req.add_header("Content-Type", "application/json")
    
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error querying STK status: {e}")
        return None

# --- Stripe Card Checkout API Helpers ---

def create_stripe_checkout_session(order_id, amount, success_url, cancel_url, stripe_secret_key):
    import base64
    url = "https://api.stripe.com/v1/checkout/sessions"
    auth_str = f"{stripe_secret_key}:"
    auth_bytes = auth_str.encode('utf-8')
    auth_b64 = base64.b64encode(auth_bytes).decode('utf-8')
    
    amount_cents = int(amount * 100)
    
    payload = {
        "payment_method_types[]": "card",
        "line_items[0][price_data][currency]": "kes",
        "line_items[0][price_data][product_data][name]": f"Order #{order_id} - MooFresh Purchase",
        "line_items[0][price_data][unit_amount]": amount_cents,
        "line_items[0][quantity]": 1,
        "mode": "payment",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": str(order_id)
    }
    
    data_str = urllib.parse.urlencode(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data_str, method="POST")
    req.add_header("Authorization", f"Basic {auth_b64}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    
    with urllib.request.urlopen(req) as response:
        res_data = json.loads(response.read().decode('utf-8'))
        return res_data.get("url"), res_data.get("id")

def verify_stripe_session(session_id, stripe_secret_key):
    import base64
    url = f"https://api.stripe.com/v1/checkout/sessions/{session_id}"
    auth_str = f"{stripe_secret_key}:"
    auth_bytes = auth_str.encode('utf-8')
    auth_b64 = base64.b64encode(auth_bytes).decode('utf-8')
    
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Basic {auth_b64}")
    
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Stripe Session Verification Error: {e}")
        return None



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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS contact_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            payment_method TEXT NOT NULL,
            checkout_request_id TEXT UNIQUE,
            status TEXT NOT NULL DEFAULT 'Pending',
            amount REAL,
            receipt_number TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(order_id) REFERENCES orders(id)
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
    # Clear old admin if any
    conn.execute("DELETE FROM users WHERE email = 'admin@moofresh.com'")
    
    admin = conn.execute("SELECT id FROM users WHERE email = ?", ("lucymumo537@gmail.com",)).fetchone()
    if admin is None:
        salt = secrets.token_hex(16)
        conn.execute(
            "INSERT INTO users (name, email, phone, password_hash, password_salt, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("Lucy Mumo", "lucymumo537@gmail.com", "+254797966428", hash_password("7lucy11", salt), salt, "admin", "2026-07-10T00:00:00"),
        )
    else:
        # Keep admin credentials permanent and updated
        salt = secrets.token_hex(16)
        conn.execute(
            "UPDATE users SET name = ?, phone = ?, password_hash = ?, password_salt = ? WHERE email = ?",
            ("Lucy Mumo", "+254797966428", hash_password("7lucy11", salt), salt, "lucymumo537@gmail.com"),
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
        if path == "/api/my-orders":
            user = self.get_current_user()
            if not user:
                self.send_json(401, {"error": "Authentication required"})
                return
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM orders WHERE customer_email = ? ORDER BY id DESC", (user["email"],)).fetchall()
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
        if path == "/api/contact":
            if not self.require_role("admin"):
                return
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM contact_messages ORDER BY id DESC").fetchall()
            conn.close()
            payload = [{
                "id": row["id"],
                "name": row["name"],
                "email": row["email"],
                "message": row["message"],
                "createdAt": row["created_at"],
            } for row in rows]
            self.send_json(200, {"messages": payload})
            return
        if path == "/api/payments/status":
            self.handle_payment_status_get()
            return
        if path == "/api/payments/stripe-success":
            self.handle_stripe_success_get()
            return
        self.send_json(404, {"error": "Not found"})

    def handle_api_post(self, path):
        if path == "/api/payments/initiate":
            self.handle_payment_initiate_post()
            return
        if path == "/api/payments/callback":
            self.handle_payment_callback_post()
            return
        if path == "/api/auth":
            self.handle_auth()
            return
        if path == "/api/orders":
            self.handle_order_create()
            return
        if path == "/api/products":
            self.handle_product_create()
            return
        if path == "/api/profile/update":
            self.handle_profile_update()
            return
        if path == "/api/orders/update-status":
            self.handle_order_status_update()
            return
        if path == "/api/products/edit":
            self.handle_product_edit()
            return
        if path == "/api/products/delete":
            self.handle_product_delete()
            return
        if path == "/api/contact":
            self.handle_contact_create()
            return
        if path == "/api/logout":
            self.clear_session()
            self.send_json(200, {"ok": True, "message": "Logged out"})
            return
        self.send_json(404, {"error": "Not found"})

    def handle_payment_initiate_post(self):
        user = self.get_current_user()
        if not user or user.get("role") != "customer":
            self.send_json(401, {"error": "Authentication required"})
            return
            
        payload = self.read_json_body() or {}
        order_id = payload.get("orderId")
        method = payload.get("method")
        phone = payload.get("phone")
        
        if not order_id or not method:
            self.send_json(400, {"error": "Order ID and method are required"})
            return
            
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        
        # Check order exists
        order = conn.execute("SELECT * FROM orders WHERE id = ? AND customer_email = ?", (order_id, user["email"])).fetchone()
        if not order:
            conn.close()
            self.send_json(404, {"error": "Order not found"})
            return
            
        # Get product price
        product_row = conn.execute("SELECT price FROM products WHERE name = ?", (order["product"],)).fetchone()
        price_str = product_row["price"] if product_row else "Kes 120/L"
        price = parse_price(price_str)
        quantity = parse_quantity(order["quantity"])
        amount = price * quantity
        
        if method == "mpesa":
            if not phone:
                conn.close()
                self.send_json(400, {"error": "Phone number is required for M-Pesa STK Push"})
                return
                
            key = CONFIG.get("MPESA_CONSUMER_KEY")
            secret = CONFIG.get("MPESA_CONSUMER_SECRET")
            if not key or not secret or key.startswith("placeholder") or secret.startswith("placeholder"):
                conn.close()
                self.send_json(400, {"error": "M-Pesa API credentials are not configured in .env."})
                return
                
            callback_url = f"{CONFIG.get('BASE_URL')}/api/payments/callback"
            try:
                res = initiate_stk_push(phone, amount, order_id, callback_url, CONFIG)
                checkout_id = res.get("CheckoutRequestID")
                response_code = res.get("ResponseCode")
                
                if response_code == "0" and checkout_id:
                    conn.execute(
                        "INSERT INTO payments (order_id, payment_method, checkout_request_id, status, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                        (order_id, "mpesa", checkout_id, "Pending", amount, self.timestamp())
                    )
                    conn.commit()
                    conn.close()
                    self.send_json(200, {
                        "ok": True, 
                        "checkoutRequestId": checkout_id,
                        "message": "STK Push initiated successfully! Please check your phone for PIN prompt."
                    })
                else:
                    conn.close()
                    desc = res.get("CustomerMessage", "STK Push request failed")
                    self.send_json(500, {"error": desc})
            except Exception as e:
                conn.close()
                self.send_json(500, {"error": str(e)})
                
        elif method == "card":
            stripe_secret = CONFIG.get("STRIPE_SECRET_KEY")
            if not stripe_secret or stripe_secret.startswith("placeholder"):
                conn.close()
                self.send_json(400, {"error": "Stripe API credentials are not configured in .env."})
                return
                
            success_url = f"{CONFIG.get('BASE_URL')}/api/payments/stripe-success?session_id={{CHECKOUT_SESSION_ID}}"
            cancel_url = f"{CONFIG.get('BASE_URL')}/customer-login.html?payment=cancelled"
            try:
                checkout_url, session_id = create_stripe_checkout_session(order_id, amount, success_url, cancel_url, stripe_secret)
                if checkout_url and session_id:
                    conn.execute(
                        "INSERT INTO payments (order_id, payment_method, checkout_request_id, status, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                        (order_id, "card", session_id, "Pending", amount, self.timestamp())
                    )
                    conn.commit()
                    conn.close()
                    self.send_json(200, {
                        "ok": True,
                        "checkoutUrl": checkout_url,
                        "message": "Redirecting to Stripe secure checkout page..."
                    })
                else:
                    conn.close()
                    self.send_json(500, {"error": "Failed to generate Stripe checkout session"})
            except Exception as e:
                conn.close()
                self.send_json(500, {"error": str(e)})
        else:
            conn.close()
            self.send_json(400, {"error": f"Unsupported payment method: {method}"})

    def handle_payment_callback_post(self):
        try:
            payload = self.read_json_body() or {}
            body = payload.get("Body", {})
            stk_callback = body.get("stkCallback", {})
            
            checkout_id = stk_callback.get("CheckoutRequestID")
            result_code = stk_callback.get("ResultCode")
            
            if not checkout_id:
                self.send_json(400, {"error": "Invalid callback structure"})
                return
                
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            
            payment = conn.execute("SELECT * FROM payments WHERE checkout_request_id = ?", (checkout_id,)).fetchone()
            if not payment:
                conn.close()
                self.send_json(404, {"error": "Payment record not found"})
                return
                
            order_id = payment["order_id"]
            
            if result_code == 0:
                receipt_number = ""
                metadata = stk_callback.get("CallbackMetadata", {}).get("Item", [])
                for item in metadata:
                    if item.get("Name") == "MpesaReceiptNumber":
                        receipt_number = item.get("Value")
                        break
                        
                conn.execute(
                    "UPDATE payments SET status = 'Completed', receipt_number = ? WHERE checkout_request_id = ?",
                    (receipt_number, checkout_id)
                )
                conn.execute("UPDATE orders SET status = 'Paid' WHERE id = ?", (order_id,))
            else:
                conn.execute(
                    "UPDATE payments SET status = 'Failed' WHERE checkout_request_id = ?",
                    (checkout_id,)
                )
                conn.execute("UPDATE orders SET status = 'Payment Failed' WHERE id = ?", (order_id,))
                
            conn.commit()
            conn.close()
            self.send_json(200, {"ResultCode": 0, "ResultDesc": "Callback processed successfully"})
        except Exception as e:
            print(f"Error handling M-Pesa callback: {e}")
            self.send_json(500, {"error": str(e)})

    def handle_payment_status_get(self):
        user = self.get_current_user()
        if not user:
            self.send_json(401, {"error": "Authentication required"})
            return
            
        parsed_url = urlparse(self.path)
        params = parse_qs(parsed_url.query)
        order_id_list = params.get("orderId")
        
        if not order_id_list:
            self.send_json(400, {"error": "Order ID is required"})
            return
            
        order_id = order_id_list[0]
        
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        
        payment = conn.execute("SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1", (order_id,)).fetchone()
        
        if not payment:
            order = conn.execute("SELECT status FROM orders WHERE id = ?", (order_id,)).fetchone()
            conn.close()
            status = order["status"] if order else "Pending"
            self.send_json(200, {"status": status})
            return
            
        if payment["status"] == "Pending" and payment["payment_method"] == "mpesa":
            checkout_id = payment["checkout_request_id"]
            try:
                res = query_stk_push_status(checkout_id, CONFIG)
                if res:
                    result_code = res.get("ResultCode")
                    if result_code == "0":
                        conn.execute(
                            "UPDATE payments SET status = 'Completed', receipt_number = ? WHERE checkout_request_id = ?",
                            (res.get("MpesaReceiptNumber", "STK_QUERY_OK"), checkout_id)
                        )
                        conn.execute("UPDATE orders SET status = 'Paid' WHERE id = ?", (order_id,))
                        conn.commit()
                        self.send_json(200, {"status": "Paid"})
                        conn.close()
                        return
                    elif result_code and result_code not in ["0", "1032", "Request in progress"]:
                        conn.execute(
                            "UPDATE payments SET status = 'Failed' WHERE checkout_request_id = ?",
                            (checkout_id,)
                        )
                        conn.execute("UPDATE orders SET status = 'Payment Failed' WHERE id = ?", (order_id,))
                        conn.commit()
                        self.send_json(200, {"status": "Failed", "error": res.get("ResultDesc", "Payment failed")})
                        conn.close()
                        return
                    elif result_code == "1032":
                        conn.execute(
                            "UPDATE payments SET status = 'Failed' WHERE checkout_request_id = ?",
                            (checkout_id,)
                        )
                        conn.execute("UPDATE orders SET status = 'Cancelled' WHERE id = ?", (order_id,))
                        conn.commit()
                        self.send_json(200, {"status": "Failed", "error": "Transaction cancelled by user"})
                        conn.close()
                        return
            except Exception as e:
                print(f"Exception checking M-Pesa STK query status: {e}")
                
        db_payment_status = payment["status"]
        if db_payment_status == "Completed":
            ret_status = "Paid"
        elif db_payment_status == "Failed":
            ret_status = "Failed"
        else:
            ret_status = "Pending"
            
        conn.close()
        self.send_json(200, {"status": ret_status})

    def handle_stripe_success_get(self):
        parsed_url = urlparse(self.path)
        params = parse_qs(parsed_url.query)
        session_id_list = params.get("session_id")
        
        if not session_id_list:
            self.send_response(302)
            self.send_header("Location", "/customer-login.html?payment=failed")
            self.end_headers()
            return
            
        session_id = session_id_list[0]
        stripe_secret = CONFIG.get("STRIPE_SECRET_KEY")
        
        verified = False
        order_id = None
        
        if stripe_secret and not stripe_secret.startswith("placeholder"):
            session_data = verify_stripe_session(session_id, stripe_secret)
            if session_data and session_data.get("payment_status") == "paid":
                verified = True
                order_id = session_data.get("client_reference_id")
                
        if verified and order_id:
            conn = sqlite3.connect(DB_PATH)
            conn.execute(
                "UPDATE payments SET status = 'Completed', checkout_request_id = ? WHERE checkout_request_id = ? OR order_id = ?",
                (session_id, session_id, order_id)
            )
            conn.execute("UPDATE orders SET status = 'Paid' WHERE id = ?", (order_id,))
            conn.commit()
            conn.close()
            
            self.send_response(302)
            self.send_header("Location", "/customer-login.html?payment=success")
            self.end_headers()
        else:
            self.send_response(302)
            self.send_header("Location", "/customer-login.html?payment=failed")
            self.end_headers()


    def handle_profile_update(self):
        user = self.get_current_user()
        if not user:
            self.send_json(401, {"error": "Authentication required"})
            return
        payload = self.read_json_body() or {}
        name = (payload.get("name") or "").strip()
        phone = (payload.get("phone") or "").strip()
        password = payload.get("password") or ""

        if not name or not phone:
            self.send_json(400, {"error": "Name and phone are required"})
            return

        conn = sqlite3.connect(DB_PATH)
        if password:
            salt = secrets.token_hex(16)
            conn.execute(
                "UPDATE users SET name = ?, phone = ?, password_hash = ?, password_salt = ? WHERE id = ?",
                (name, phone, hash_password(password, salt), salt, user["id"]),
            )
        else:
            conn.execute(
                "UPDATE users SET name = ?, phone = ? WHERE id = ?",
                (name, phone, user["id"]),
            )
        conn.commit()
        
        # Update user dict in active session
        user["name"] = name
        user["phone"] = phone
        
        conn.close()
        self.send_json(200, {"ok": True, "message": "Profile updated successfully", "user": user})

    def handle_order_status_update(self):
        if not self.require_role("admin"):
            return
        payload = self.read_json_body() or {}
        order_id = payload.get("orderId")
        status = (payload.get("status") or "").strip()
        if not order_id or not status:
            self.send_json(400, {"error": "Order ID and status are required"})
            return
        conn = sqlite3.connect(DB_PATH)
        conn.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
        conn.commit()
        conn.close()
        self.send_json(200, {"ok": True, "message": "Order status updated successfully"})

    def handle_product_edit(self):
        if not self.require_role("admin"):
            return
        payload = self.read_json_body() or {}
        product_id = payload.get("id")
        name = (payload.get("name") or "").strip()
        description = (payload.get("description") or "").strip()
        category = (payload.get("category") or "").strip()
        price = (payload.get("price") or "").strip()
        stock = (payload.get("stock") or "").strip()
        is_published = self.parse_bool(payload.get("isPublished") or payload.get("is_published") or True)

        if not product_id or not all([name, description, category, price, stock]):
            self.send_json(400, {"error": "All fields are required to edit product"})
            return

        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "UPDATE products SET name = ?, description = ?, category = ?, price = ?, stock = ?, is_published = ? WHERE id = ?",
            (name, description, category, price, stock, is_published, product_id)
        )
        conn.commit()
        conn.close()
        self.send_json(200, {"ok": True, "message": "Product updated successfully"})

    def handle_product_delete(self):
        if not self.require_role("admin"):
            return
        payload = self.read_json_body() or {}
        product_id = payload.get("id")
        if not product_id:
            self.send_json(400, {"error": "Product ID is required"})
            return
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
        conn.commit()
        conn.close()
        self.send_json(200, {"ok": True, "message": "Product deleted successfully"})

    def handle_contact_create(self):
        payload = self.read_json_body() or {}
        name = (payload.get("name") or "").strip()
        email = (payload.get("email") or "").strip().lower()
        message = (payload.get("message") or "").strip()
        if not name or not email or not message:
            self.send_json(400, {"error": "All contact fields are required"})
            return
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "INSERT INTO contact_messages (name, email, message, created_at) VALUES (?, ?, ?, ?)",
            (name, email, message, self.timestamp())
        )
        conn.commit()
        conn.close()
        self.send_json(200, {"ok": True, "message": "Message sent successfully! We will get back to you shortly."})

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
            user_row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
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
    load_env()
    init_db()
    ensure_seed_users()
    ensure_seed_products()
    server = ThreadingHTTPServer(("0.0.0.0", 8000), DairyHandler)
    print("Serving MooFresh Dairy on http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
