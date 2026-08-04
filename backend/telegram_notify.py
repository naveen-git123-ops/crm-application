"""Telegram Bot notifications for Resoline CRM."""

import hashlib
import hmac
import logging
import os
from typing import Optional

import requests

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = 'https://api.telegram.org/bot{token}/{method}'


def telegram_bot_username() -> str:
    return os.environ.get('TELEGRAM_BOT_USERNAME', 'Resoline_bot').strip()


def make_telegram_start_payload(user_id: str, secret: str) -> str:
    """Build a signed /start payload embedding the CRM user id (Telegram max 64 chars)."""
    uid = user_id.replace('-', '')
    sig = hmac.new(secret.encode(), uid.encode(), hashlib.sha256).hexdigest()[:8]
    return f'u{uid}{sig}'


def parse_user_id_from_start_payload(payload: str, secret: str) -> Optional[str]:
    """Validate signed /start payload and return the CRM user UUID."""
    if not payload or not payload.startswith('u') or len(payload) != 41:
        return None
    uid_hex = payload[1:33]
    sig = payload[33:]
    expected = hmac.new(secret.encode(), uid_hex.encode(), hashlib.sha256).hexdigest()[:8]
    if not hmac.compare_digest(sig, expected):
        return None
    return f'{uid_hex[:8]}-{uid_hex[8:12]}-{uid_hex[12:16]}-{uid_hex[16:20]}-{uid_hex[20:]}'


def build_telegram_connect_url(user_id: str, secret: str) -> str:
    bot = telegram_bot_username()
    payload = make_telegram_start_payload(user_id, secret)
    return f'https://t.me/{bot}?start={payload}'


def _bot_token() -> str:
    return os.environ.get('TELEGRAM_BOT_TOKEN', '').strip()


def telegram_enabled() -> bool:
    return bool(_bot_token())


def send_telegram_message(text: str, chat_id: Optional[str] = None) -> bool:
    """Send a plain-text message to a Telegram chat. Returns True on success."""
    ok, _ = send_telegram_message_verbose(text, chat_id)
    return ok


def send_telegram_message_verbose(text: str, chat_id: Optional[str] = None) -> tuple:
    """Send a message and return (ok, error_message). error_message is Telegram's own description on failure."""
    token = _bot_token()
    if not token:
        return False, 'TELEGRAM_BOT_TOKEN is not set on the server'

    target = (chat_id or os.environ.get('TELEGRAM_CHAT_ID', '')).strip()
    if not target:
        return False, 'No chat_id provided'

    try:
        url = TELEGRAM_API_BASE.format(token=token, method='sendMessage')
        response = requests.post(
            url,
            json={'chat_id': target, 'text': text},
            timeout=10,
        )
        if not response.ok:
            try:
                error_desc = response.json().get('description', response.text[:300])
            except Exception:
                error_desc = response.text[:300]
            logger.warning('Telegram sendMessage failed: %s %s', response.status_code, error_desc)
            return False, f'{response.status_code}: {error_desc}'
        return True, None
    except Exception as exc:
        logger.warning('Telegram sendMessage error: %s', exc)
        return False, str(exc)


def notify_telegram_targets(message: str, user_chat_id: Optional[str] = None) -> None:
    """Send to the user's linked chat, and optionally to the admin fallback chat."""
    sent_to = set()
    if user_chat_id:
        if send_telegram_message(message, user_chat_id):
            sent_to.add(str(user_chat_id))

    fallback = os.environ.get('TELEGRAM_CHAT_ID', '').strip()
    admin = os.environ.get('TELEGRAM_ADMIN_CHAT_ID', '').strip()

    for chat_id in (fallback, admin):
        if chat_id and chat_id not in sent_to:
            send_telegram_message(message, chat_id)
            sent_to.add(chat_id)


def set_telegram_webhook() -> dict:
    """Register the Telegram webhook URL (Admin setup helper)."""
    token = _bot_token()
    webhook_base = os.environ.get('TELEGRAM_WEBHOOK_URL', '').strip()
    if not token or not webhook_base:
        raise ValueError('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_URL are required')

    secret = os.environ.get('TELEGRAM_WEBHOOK_SECRET', '').strip()
    webhook_url = webhook_base.rstrip('/') + '/api/telegram/webhook'
    body = {'url': webhook_url, 'allowed_updates': ['message']}
    if secret:
        body['secret_token'] = secret

    response = requests.post(
        TELEGRAM_API_BASE.format(token=token, method='setWebhook'),
        json=body,
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def delete_telegram_webhook(drop_pending_updates: bool = False) -> dict:
    """Remove webhook so getUpdates / long-polling can receive messages."""
    token = _bot_token()
    if not token:
        raise ValueError('TELEGRAM_BOT_TOKEN is not set')
    response = requests.post(
        TELEGRAM_API_BASE.format(token=token, method='deleteWebhook'),
        json={'drop_pending_updates': bool(drop_pending_updates)},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def get_telegram_updates(offset: Optional[int] = None, timeout: int = 25) -> list:
    """Long-poll Telegram for new updates (used when webhook is unreachable)."""
    token = _bot_token()
    if not token:
        return []
    body = {
        'timeout': max(1, min(int(timeout), 50)),
        'allowed_updates': ['message'],
    }
    if offset is not None:
        body['offset'] = int(offset)
    try:
        response = requests.post(
            TELEGRAM_API_BASE.format(token=token, method='getUpdates'),
            json=body,
            timeout=timeout + 10,
        )
        if not response.ok:
            logger.warning('Telegram getUpdates failed: %s %s', response.status_code, response.text[:300])
            return []
        return response.json().get('result') or []
    except Exception as exc:
        logger.warning('Telegram getUpdates error: %s', exc)
        return []


def telegram_mode() -> str:
    """webhook | polling — polling is more reliable when Telegram cannot reach the API host."""
    mode = (os.environ.get('TELEGRAM_MODE') or 'polling').strip().lower()
    return mode if mode in ('webhook', 'polling') else 'polling'
