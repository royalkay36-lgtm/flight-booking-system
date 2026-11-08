"""Kiểm thử vòng gọi công cụ của chế độ AI bằng client giả (không gọi API thật, không cần database)."""
import datetime as dt
from decimal import Decimal
from types import SimpleNamespace as NS

import anthropic
import httpx2

from app import chatbot as rules
from app import chatbot_ai

VN = dt.timezone(dt.timedelta(hours=7))
ROW = {"flight_id": 1, "flight_number": "VN213", "airline_name": "Vietnam Airlines", "origin": "HAN", "destination": "DAD",
       "origin_city": "Hà Nội", "destination_city": "Đà Nẵng", "departure_time": dt.datetime(2026, 11, 20, 6, tzinfo=VN),
       "arrival_time": dt.datetime(2026, 11, 20, 7, 20, tzinfo=VN), "fare_class": "ECO_SAVER",
       "fare_name": "Phổ thông Tiết kiệm", "cabin_class": "ECONOMY", "price": Decimal("990000")}


class FakeDB:
    def execute(self, sql, params=None):
        return NS(fetchall=lambda: [{"iata_code": "DAD", "city": "Đà Nẵng"}, {"iata_code": "HAN", "city": "Hà Nội"}])


class FakeClient:
    def __init__(self, *responses):
        self.responses, self.calls = list(responses), []
        self.beta = NS(messages=NS(create=self.create))

    def create(self, **kwargs):
        self.calls.append(kwargs)
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def ask(monkeypatch, fake, message="HN đi Đà Nẵng 20/11", history=()):
    monkeypatch.setattr(chatbot_ai, "client", lambda: fake)
    monkeypatch.setattr(rules, "find_flights", lambda db, q, today: [ROW] if q["origin"] == "HAN" else [])
    return chatbot_ai.reply(rules.ChatIn(message=message, history=list(history)), None, FakeDB())


def test_goi_cong_cu_tim_chuyen_roi_tra_loi_kem_the_chuyen_bay(monkeypatch):
    fake = FakeClient(
        NS(stop_reason="tool_use", content=[NS(type="tool_use", id="t1", name="search_flights",
                                               input={"origin": "han", "destination": "DAD", "date": "2026-11-20"})]),
        NS(stop_reason="end_turn", content=[NS(type="text", text="Rẻ nhất 990.000đ, bay 06:00.")]),
    )
    answer = ask(monkeypatch, fake, history=[{"role": "assistant", "content": "Xin chào!"}])
    assert answer["reply"] == "Rẻ nhất 990.000đ, bay 06:00." and answer["source"] == "ai"
    assert answer["flights"] == [ROW]
    assert answer["context"]["origin"] == "HAN" and answer["context"]["date"] == dt.date(2026, 11, 20)
    messages = fake.calls[-1]["messages"]
    assert messages[0] == {"role": "user", "content": "HN đi Đà Nẵng 20/11"}  # lời chào của bot bị bỏ khỏi đầu
    assert messages[1]["role"] == "system" and "Hôm nay" in messages[1]["content"]
    result = messages[-1]["content"][0]
    assert result["tool_use_id"] == "t1" and "VN213" in result["content"] and result["is_error"] is False


def test_tham_so_sai_bao_loi_cho_mo_hinh_tu_sua(monkeypatch):
    fake = FakeClient(
        NS(stop_reason="tool_use", content=[NS(type="tool_use", id="t1", name="search_flights",
                                               input={"origin": "Hà Nội", "destination": "DAD"})]),
        NS(stop_reason="end_turn", content=[NS(type="text", text="Bạn bay từ sân bay nào?")]),
    )
    answer = ask(monkeypatch, fake)
    assert fake.calls[-1]["messages"][-1]["content"][0]["is_error"] is True
    assert "flights" not in answer


def test_khong_co_key_loi_mang_hoac_tu_choi_thi_dung_bot_theo_luat(monkeypatch):
    assert ask(monkeypatch, None) is None
    error = anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))
    assert ask(monkeypatch, FakeClient(error)) is None
    assert ask(monkeypatch, FakeClient(NS(stop_reason="refusal", content=[]))) is None
    looping = [NS(stop_reason="tool_use", content=[NS(type="tool_use", id=f"t{i}", name="get_policy", input={"topic": "kids"})])
               for i in range(chatbot_ai.MAX_TOOL_ROUNDS + 1)]
    assert ask(monkeypatch, FakeClient(*looping)) is None  # gọi công cụ mãi không dừng
