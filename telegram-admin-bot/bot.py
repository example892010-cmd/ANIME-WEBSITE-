"""ANIFLIX NETWORK TAMIL admin bot.

Runs as a separate Telegram polling service and calls the website's protected
admin API. It does not store anime content locally; PocketBase remains the
shared persistent database for both the website and this bot.
"""

import json
import logging
import os
import time
from typing import Any

import requests

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("aniflix-admin-bot")

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
OWNER_ID = os.getenv("TELEGRAM_ADMIN_ID", "").strip()
API_BASE = os.getenv("ANIFLIX_SITE_URL", "").rstrip("/")
BOT_SECRET = os.getenv("TELEGRAM_ADMIN_BOT_SECRET", "").strip()
if not all((BOT_TOKEN, OWNER_ID, API_BASE, BOT_SECRET)):
    raise SystemExit("Set TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_ID, ANIFLIX_SITE_URL and TELEGRAM_ADMIN_BOT_SECRET.")

TG = f"https://api.telegram.org/bot{BOT_TOKEN}"
FILE_API = f"https://api.telegram.org/file/bot{BOT_TOKEN}"
SESSION: str | None = None
WAITING: dict[int, dict[str, Any]] = {}


def tg(method: str, payload: dict[str, Any] | None = None, files=None):
    response = requests.post(f"{TG}/{method}", data=payload, files=files, timeout=35)
    response.raise_for_status()
    data = response.json()
    if not data.get("ok"):
        raise RuntimeError(data.get("description", "Telegram API error"))
    return data.get("result")


def send(chat_id: int, text: str, keyboard=None):
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text, "disable_web_page_preview": True}
    if keyboard:
        payload["reply_markup"] = json.dumps({"inline_keyboard": keyboard})
    return tg("sendMessage", payload)


def edit(chat_id: int, message_id: int, text: str, keyboard=None):
    payload: dict[str, Any] = {"chat_id": chat_id, "message_id": message_id, "text": text, "disable_web_page_preview": True}
    if keyboard:
        payload["reply_markup"] = json.dumps({"inline_keyboard": keyboard})
    return tg("editMessageText", payload)


def is_owner(user_id: int) -> bool:
    return str(user_id) == OWNER_ID


def is_authed(user_id: int) -> bool:
    return bool(SESSION and is_owner(user_id))


def api(method: str, path: str, **kwargs):
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {SESSION or ''}"
    response = requests.request(method, f"{API_BASE}{path}", headers=headers, timeout=45, **kwargs)
    try:
        data = response.json()
    except ValueError:
        data = {"error": response.text[:500]}
    if not response.ok:
        raise RuntimeError(data.get("error", f"Website API error ({response.status_code})"))
    return data


def menu_text():
    return "ANIFLIX ADMIN CONTROL\nChoose what you want to manage."


def menu_keyboard():
    return [
        [{"text": "➕ Add Anime", "callback_data": "add"}, {"text": "📚 Anime List", "callback_data": "list"}],
        [{"text": "✏️ Edit Anime", "callback_data": "edit"}, {"text": "🖼 Upload Poster", "callback_data": "poster"}],
        [{"text": "🎬 Manage Episodes", "callback_data": "episodes"}, {"text": "🏷 Categories", "callback_data": "categories"}],
        [{"text": "🔄 Change Status", "callback_data": "status"}, {"text": "🗑 Delete Anime", "callback_data": "delete"}],
        [{"text": "⭐ Homepage Feature", "callback_data": "feature"}, {"text": "🔐 Change Password", "callback_data": "password"}],
        [{"text": "🚪 Logout", "callback_data": "logout"}],
    ]


def show_menu(chat_id: int):
    send(chat_id, menu_text(), menu_keyboard())


def start_add(chat_id: int):
    WAITING[chat_id] = {"step": "title", "payload": {}}
    send(chat_id, "➕ Add anime\nSend the anime title.")


def next_add(chat_id: int, value: str):
    state = WAITING[chat_id]
    payload = state["payload"]
    step = state["step"]
    if step == "title":
        payload["title"] = value.strip()
        slug = "-".join(filter(None, "".join(ch.lower() if ch.isascii() and ch.isalnum() else " " for ch in value).split()))
        payload["slug"] = slug or f"anime-{int(time.time())}"
        state["step"] = "description"
        send(chat_id, "Send a short description, or /skip.")
    elif step == "description":
        payload["description"] = "" if value == "/skip" else value.strip()
        state["step"] = "status"
        send(chat_id, "Send status: ONGOING, COMPLETED, UPCOMING or HIATUS.")
    elif step == "status":
        status = value.strip().upper()
        if status not in {"ONGOING", "COMPLETED", "UPCOMING", "HIATUS"}:
            send(chat_id, "Choose ONGOING, COMPLETED, UPCOMING or HIATUS.")
            return
        payload["status"] = status
        state["step"] = "genres"
        send(chat_id, "Send genres separated by commas, or /skip.")
    elif step == "genres":
        payload["genres"] = [] if value == "/skip" else [x.strip() for x in value.split(",") if x.strip()]
        state["step"] = "languages"
        send(chat_id, "Send audio languages separated by commas (example: Tamil, Japanese).")
    elif step == "languages":
        payload["audioLanguages"] = [x.strip() for x in value.split(",") if x.strip()] or ["Tamil"]
        state["step"] = "qualities"
        send(chat_id, "Send qualities separated by commas (example: 480p, 720p, 1080p).")
    elif step == "qualities":
        payload["qualities"] = [x.strip() for x in value.split(",") if x.strip()] or ["480p", "720p", "1080p"]
        state["step"] = "seasons"
        sample = '[{"number":1,"title":"Season 1","episodes":[{"number":1,"title":"Episode 1","url":"https://example.com/watch"}]}]'
        send(chat_id, f"Send seasons and episodes as JSON. Use [] if there are no episodes yet.\nExample:\n{sample}")
    elif step == "seasons":
        try:
            parsed = json.loads(value)
            if not isinstance(parsed, list):
                raise ValueError("JSON must be an array")
            payload["seasons"] = parsed
        except Exception as exc:
            send(chat_id, f"Invalid JSON: {exc}\nSend the seasons JSON again, or /skip.")
            return
        state["step"] = "poster"
        send(chat_id, "Now send a poster photo, or send a direct poster URL, or /skip.")
    elif step == "poster":
        if value == "/skip":
            payload["featured"] = False
            save_new_anime(chat_id, payload)
        elif value.startswith("https://") or value.startswith("http://"):
            payload["posterUrl"] = value.strip()
            payload["featured"] = False
            save_new_anime(chat_id, payload)
        else:
            send(chat_id, "Please send a poster photo, a direct image URL, or /skip.")


def save_new_anime(chat_id: int, payload: dict[str, Any], photo: bytes | None = None):
    try:
        if photo:
            data = {key: json.dumps(value, ensure_ascii=False) if isinstance(value, (list, dict, bool)) else str(value) for key, value in payload.items()}
            api("POST", "/api/admin/anime", data=data, files={"poster": ("poster.jpg", photo, "image/jpeg")})
        else:
            api("POST", "/api/admin/anime", json=payload)
        WAITING.pop(chat_id, None)
        send(chat_id, f"✅ Added {payload['title']} to the website.", menu_keyboard())
    except Exception as exc:
        send(chat_id, f"Could not add anime: {exc}\nYour details are still in this chat; use Add Anime again after fixing the issue.", menu_keyboard())
        WAITING.pop(chat_id, None)


def list_anime(chat_id: int):
    try:
        items = api("GET", "/api/admin/anime").get("items", [])
        if not items:
            send(chat_id, "No anime entries have been added yet.", menu_keyboard())
            return
        lines = [f"• {item['title']}  [{item['status']}]\n  slug: {item['slug']}" for item in items[:40]]
        send(chat_id, "ANIME LIST\n\n" + "\n\n".join(lines) + (f"\n\nShowing 40 of {len(items)}" if len(items) > 40 else ""), menu_keyboard())
    except Exception as exc:
        send(chat_id, f"Could not load anime: {exc}", menu_keyboard())


def pick_item(chat_id: int, operation: str):
    try:
        items = api("GET", "/api/admin/anime").get("items", [])
        if not items:
            send(chat_id, "There are no anime entries yet.", menu_keyboard())
            return
        buttons = [[{"text": f"{item['title']} · {item['status']}", "callback_data": f"{operation}:{item['id']}"}] for item in items[:40]]
        buttons.append([{"text": "⬅️ Menu", "callback_data": "menu"}])
        send(chat_id, "Choose an anime:", buttons)
    except Exception as exc:
        send(chat_id, f"Could not load anime: {exc}", menu_keyboard())


def handle_message(message: dict[str, Any]):
    global SESSION
    user = message.get("from", {})
    chat_id = message.get("chat", {}).get("id")
    if chat_id is None:
        return
    if message.get("chat", {}).get("type") != "private":
        return
    user_id = user.get("id", 0)
    if not is_owner(user_id):
        send(chat_id, "⛔ This admin bot is private.")
        return

    text_value = (message.get("text") or "").strip()
    if text_value.startswith("/start"):
        SESSION = None
        WAITING.pop(chat_id, None)
        send(chat_id, "Welcome to ANIFLIX admin control. Send the admin password to continue.")
        return
    if text_value == "/cancel":
        WAITING.pop(chat_id, None)
        send(chat_id, "Cancelled.", menu_keyboard() if is_authed(user_id) else None)
        return
    if not is_authed(user_id):
        try:
            # Remove the password message from the private chat after receiving it.
            try:
                tg("deleteMessage", {"chat_id": chat_id, "message_id": message.get("message_id")})
            except Exception:
                log.warning("Could not delete the admin password message from Telegram chat history")
            response = requests.post(f"{API_BASE}/api/admin/login", json={"password": text_value, "channel": "telegram"}, headers={"x-aniflix-bot-secret": BOT_SECRET}, timeout=30)
            data = response.json()
            if not response.ok:
                send(chat_id, data.get("error", "Password verification failed."))
                return
            SESSION = data["token"]
            send(chat_id, "✅ Admin verified. Website admin tools are unlocked.", menu_keyboard())
        except Exception as exc:
            send(chat_id, f"Could not verify admin access: {exc}")
        return

    if chat_id in WAITING:
        state = WAITING[chat_id]
        if state.get("step") == "poster" and message.get("photo"):
            try:
                photo = message["photo"][-1]
                file_info = tg("getFile", {"file_id": photo["file_id"]})
                image_response = requests.get(f"{FILE_API}/{file_info['file_path']}", timeout=40)
                image_response.raise_for_status()
                payload = state["payload"]
                payload["featured"] = False
                save_new_anime(chat_id, payload, image_response.content)
            except Exception as exc:
                send(chat_id, f"Poster upload failed: {exc}. Send another image or /skip.")
            return
        if text_value == "/skip" or text_value:
            next_add(chat_id, text_value or "/skip")
        else:
            send(chat_id, "Please send the requested text or /cancel.")
        return

    if text_value == "/menu":
        show_menu(chat_id)
    elif text_value == "/list":
        list_anime(chat_id)
    else:
        send(chat_id, "Use the admin menu below.", menu_keyboard())


def handle_callback(callback: dict[str, Any]):
    global SESSION
    user_id = callback.get("from", {}).get("id", 0)
    message = callback.get("message", {})
    chat_id = message.get("chat", {}).get("id")
    if message.get("chat", {}).get("type") != "private":
        return
    data = callback.get("data", "")
    tg("answerCallbackQuery", {"callback_query_id": callback["id"]})
    if not is_owner(user_id) or not is_authed(user_id):
        if chat_id:
            send(chat_id, "Admin verification required. Send /start to sign in.")
        return
    if data == "menu":
        show_menu(chat_id)
    elif data == "add":
        start_add(chat_id)
    elif data == "list":
        list_anime(chat_id)
    elif data == "edit":
        pick_item(chat_id, "edit")
    elif data == "delete":
        pick_item(chat_id, "delete")
    elif data == "status":
        pick_item(chat_id, "status")
    elif data == "poster":
        pick_item(chat_id, "poster")
    elif data == "episodes":
        pick_item(chat_id, "episodes")
    elif data == "categories":
        pick_item(chat_id, "categories")
    elif data == "feature":
        pick_item(chat_id, "feature")
    elif data == "password":
        WAITING[chat_id] = {"step": "password_current"}
        send(chat_id, "🔐 Password change\nSend your current admin password. The message will be deleted after it is received.")
    elif data == "logout":
        SESSION = None
        WAITING.pop(chat_id, None)
        send(chat_id, "Admin session ended. Send /start to authenticate again.")
    elif ":" in data:
        operation, record_id = data.split(":", 1)
        try:
            items = api("GET", "/api/admin/anime").get("items", [])
            item = next((entry for entry in items if entry["id"] == record_id), None)
            if not item:
                send(chat_id, "Anime entry not found.", menu_keyboard())
                return
            if operation == "delete":
                api("DELETE", f"/api/admin/anime/{record_id}")
                send(chat_id, f"✅ Deleted {item['title']}.", menu_keyboard())
            elif operation == "status":
                WAITING[chat_id] = {"step": "status_edit", "id": record_id, "item": item}
                send(chat_id, f"Current status: {item['status']}\nSend ONGOING, COMPLETED, UPCOMING or HIATUS.")
            elif operation == "poster":
                WAITING[chat_id] = {"step": "poster_edit", "id": record_id, "item": item}
                send(chat_id, f"Send a new poster photo or direct poster URL for {item['title']}. Send /cancel to cancel.")
            elif operation == "episodes":
                WAITING[chat_id] = {"step": "episodes_edit", "id": record_id, "item": item}
                send(chat_id, f"Send the complete seasons/episodes JSON array for {item['title']}. Use [] to clear episodes.")
            elif operation == "categories":
                WAITING[chat_id] = {"step": "categories_edit", "id": record_id, "item": item}
                send(chat_id, f"Send comma-separated genres for {item['title']}.")
            elif operation == "feature":
                WAITING[chat_id] = {"step": "feature_edit", "id": record_id, "item": item}
                send(chat_id, f"Is {item['title']} featured on the homepage? Send yes or no.")
            elif operation == "edit":
                WAITING[chat_id] = {"step": "edit_json", "id": record_id, "item": item}
                send(chat_id, f"Send a JSON object with the fields to edit for {item['title']}. Example:\n{{\"title\":\"New title\",\"description\":\"Updated description\"}}")
        except Exception as exc:
            send(chat_id, f"Action failed: {exc}", menu_keyboard())


def process_waiting_admin(message: dict[str, Any]) -> bool:
    global SESSION
    chat_id = message.get("chat", {}).get("id")
    if not is_owner(message.get("from", {}).get("id", 0)):
        return False
    if chat_id not in WAITING:
        return False
    if not is_authed(message.get("from", {}).get("id", 0)):
        WAITING.pop(chat_id, None)
        send(chat_id, "Admin session expired. Send /start and verify again.")
        return True
    state = WAITING[chat_id]
    incoming_text = (message.get("text") or "").strip()
    if state.get("step") in {"password_current", "password_new", "password_confirm"}:
        try:
            tg("deleteMessage", {"chat_id": chat_id, "message_id": message.get("message_id")})
        except Exception:
            log.warning("Could not delete a password-change message from Telegram chat history")
    if incoming_text == "/cancel":
        WAITING.pop(chat_id, None)
        send(chat_id, "Cancelled.", menu_keyboard())
        return True
    if incoming_text.startswith("/start"):
        return False
    if state.get("step") == "password_current":
        if not incoming_text:
            send(chat_id, "Send your current admin password, or /cancel.")
            return True
        state["current_password"] = incoming_text
        state["step"] = "password_new"
        send(chat_id, "Send your new admin password (at least 8 characters).")
        return True
    if state.get("step") == "password_new":
        if len(incoming_text) < 8:
            send(chat_id, "New password must contain at least 8 characters. Send it again, or /cancel.")
            return True
        state["new_password"] = incoming_text
        state["step"] = "password_confirm"
        send(chat_id, "Confirm your new admin password.")
        return True
    if state.get("step") == "password_confirm":
        if incoming_text != state.get("new_password"):
            state["step"] = "password_new"
            state.pop("new_password", None)
            send(chat_id, "The passwords do not match. Send the new password again, or /cancel.")
            return True
        try:
            api("POST", "/api/admin/password", json={
                "action": "change",
                "oldPassword": state.get("current_password", ""),
                "newPassword": state.get("new_password", ""),
                "confirmPassword": incoming_text,
            })
            WAITING.pop(chat_id, None)
            SESSION = None
            send(chat_id, "✅ Admin password changed. Send /start and sign in again using your new password.")
        except Exception as exc:
            WAITING.pop(chat_id, None)
            send(chat_id, f"Password update failed: {exc}", menu_keyboard())
        return True
    if state.get("step") == "poster_edit":
        try:
            if message.get("photo"):
                photo = message["photo"][-1]
                file_info = tg("getFile", {"file_id": photo["file_id"]})
                image_response = requests.get(f"{FILE_API}/{file_info['file_path']}", timeout=40)
                image_response.raise_for_status()
                data = {"title": state["item"]["title"], "slug": state["item"]["slug"]}
                api("PATCH", f"/api/admin/anime/{state['id']}", data=data, files={"poster": ("poster.jpg", image_response.content, "image/jpeg")})
                send(chat_id, f"✅ Poster updated for {state['item']['title']}.", menu_keyboard())
            else:
                url = (message.get("text") or "").strip()
                if not (url.startswith("https://") or url.startswith("http://")):
                    send(chat_id, "Send a poster photo, a valid image URL, or /cancel.")
                    return True
                api("PATCH", f"/api/admin/anime/{state['id']}", json={"posterUrl": url})
                send(chat_id, f"✅ Poster URL updated for {state['item']['title']}.", menu_keyboard())
        except Exception as exc:
            send(chat_id, f"Poster update failed: {exc}", menu_keyboard())
        WAITING.pop(chat_id, None)
        return True
    if state.get("step") == "episodes_edit":
        try:
            seasons = json.loads(message.get("text", ""))
            if not isinstance(seasons, list):
                raise ValueError("Send a JSON array.")
            api("PATCH", f"/api/admin/anime/{state['id']}", json={"seasons": seasons})
            send(chat_id, f"✅ Episode information updated for {state['item']['title']}.", menu_keyboard())
        except Exception as exc:
            send(chat_id, f"Invalid episodes JSON: {exc}. Try again or /cancel.")
            return True
        WAITING.pop(chat_id, None)
        return True
    if state.get("step") == "categories_edit":
        genres = [part.strip() for part in (message.get("text") or "").split(",") if part.strip()]
        try:
            api("PATCH", f"/api/admin/anime/{state['id']}", json={"genres": genres})
            send(chat_id, f"✅ Categories updated for {state['item']['title']}.", menu_keyboard())
        except Exception as exc:
            send(chat_id, f"Category update failed: {exc}", menu_keyboard())
        WAITING.pop(chat_id, None)
        return True
    if state.get("step") == "feature_edit":
        answer = (message.get("text") or "").strip().lower()
        if answer not in {"yes", "no", "true", "false"}:
            send(chat_id, "Send yes or no.")
            return True
        try:
            api("PATCH", f"/api/admin/anime/{state['id']}", json={"featured": answer in {"yes", "true"}})
            send(chat_id, f"✅ Homepage feature setting updated for {state['item']['title']}.", menu_keyboard())
        except Exception as exc:
            send(chat_id, f"Homepage update failed: {exc}", menu_keyboard())
        WAITING.pop(chat_id, None)
        return True
    if state.get("step") == "status_edit":
        status = (message.get("text") or "").strip().upper()
        if status not in {"ONGOING", "COMPLETED", "UPCOMING", "HIATUS"}:
            send(chat_id, "Status must be ONGOING, COMPLETED, UPCOMING or HIATUS.")
            return True
        try:
            item = state["item"]
            api("PATCH", f"/api/admin/anime/{state['id']}", json={"status": status})
            send(chat_id, f"✅ {item['title']} status changed to {status}.", menu_keyboard())
        except Exception as exc:
            send(chat_id, f"Could not update status: {exc}", menu_keyboard())
        WAITING.pop(chat_id, None)
        return True
    if state.get("step") == "edit_json":
        try:
            changes = json.loads(message.get("text", ""))
            if not isinstance(changes, dict):
                raise ValueError("Send a JSON object.")
            changes.setdefault("title", state["item"]["title"])
            changes.setdefault("slug", state["item"]["slug"])
            current = state["item"]
            for key in ("description", "status", "genres", "audioLanguages", "qualities", "seasons", "featured"):
                changes.setdefault(key, current.get(key))
            api("PATCH", f"/api/admin/anime/{state['id']}", json=changes)
            send(chat_id, f"✅ Updated {current['title']}.", menu_keyboard())
        except Exception as exc:
            send(chat_id, f"Edit failed: {exc}. Send a valid JSON object or /cancel.")
            return True
        WAITING.pop(chat_id, None)
        return True
    return False


def main():
    offset = 0
    log.info("ANIFLIX admin bot started")
    while True:
        try:
            updates = tg("getUpdates", {"offset": offset, "timeout": 25, "allowed_updates": json.dumps(["message", "callback_query"])})
            for update in updates:
                offset = update["update_id"] + 1
                if "callback_query" in update:
                    handle_callback(update["callback_query"])
                elif "message" in update:
                    message = update["message"]
                    if not process_waiting_admin(message):
                        handle_message(message)
        except requests.RequestException as exc:
            log.warning("Telegram polling request failed: %s", exc)
            time.sleep(5)
        except Exception:
            log.exception("Bot update failed")
            time.sleep(2)


if __name__ == "__main__":
    main()
