"""Streamlit app: cricket stats chat assistant + AI series-outcome predictor + live matches."""
import html
import os

import streamlit as st
from dotenv import load_dotenv

from src import chat_assistant, cricapi_client, db
from src.series_predictor import load_or_train

load_dotenv()

st.set_page_config(page_title="gans", page_icon="🏏", layout="wide")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
CRICAPI_KEY = os.getenv("CRICAPI_KEY", "")

db.build_database()

# ---------------------------------------------------------------- Styling
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
    html, body, [class*="css"] { font-family: 'Inter', sans-serif; }

    .hero {
        background: linear-gradient(135deg,#0f2027,#203a43,#2c5364);
        padding: 2rem 2.5rem;
        border-radius: 16px;
        color: #fff;
        margin-bottom: 1.5rem;
        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    }
    .hero h1 { margin: 0; font-size: 2.2rem; font-weight: 800; }
    .hero p { margin: 0.4rem 0 0; opacity: 0.85; font-size: 1rem; }

    .status-badge { display:flex; align-items:center; gap:8px; font-size:0.85rem; margin-bottom:8px; }
    .status-dot { width:9px; height:9px; border-radius:50%; display:inline-block; flex-shrink:0; }
    .status-dot.on { background:#22c55e; box-shadow:0 0 6px #22c55e; }
    .status-dot.off { background:#ef4444; box-shadow:0 0 6px #ef4444; }

    .team-card {
        background: rgba(127,127,127,0.08);
        border: 1px solid rgba(127,127,127,0.18);
        border-radius: 12px;
        padding: 1rem 1.2rem;
        margin-bottom: 0.5rem;
    }
    .team-card h4 { margin: 0 0 0.6rem 0; }
    .stat-row {
        display:flex; justify-content:space-between; padding:3px 0;
        font-size:0.92rem; border-bottom:1px dashed rgba(127,127,127,0.25);
    }
    .stat-row:last-child { border-bottom:none; }

    .prob-bar-wrap { margin: 0.8rem 0 1.2rem; }
    .prob-bar {
        display:flex; width:100%; height:44px; border-radius:10px; overflow:hidden;
        font-weight:700; font-size:0.85rem; box-shadow: inset 0 0 0 1px rgba(127,127,127,0.25);
    }
    .prob-a {
        background:linear-gradient(90deg,#2563eb,#3b82f6); display:flex; align-items:center;
        justify-content:flex-start; padding-left:10px; color:#fff; white-space:nowrap;
    }
    .prob-b {
        background:linear-gradient(90deg,#f97316,#fb923c); display:flex; align-items:center;
        justify-content:flex-end; padding-right:10px; color:#fff; white-space:nowrap;
    }

    .match-card h4 { margin: 0 0 0.3rem 0; }
    [data-testid="stChatMessage"] { border-radius: 14px; }
    </style>

    <div class="hero">
        <h1>🏏 gans</h1>
        <p>Chat with your stats, predict series outcomes, and track live matches.</p>
    </div>
    """,
    unsafe_allow_html=True,
)


def _status_badge(label: str, ok: bool):
    cls = "on" if ok else "off"
    text = "configured" if ok else "missing - set in .env"
    st.markdown(
        f'<div class="status-badge"><span class="status-dot {cls}"></span>'
        f'<span>{html.escape(label)}: <b>{text}</b></span></div>',
        unsafe_allow_html=True,
    )


with st.sidebar:
    st.markdown("### ⚙️ Status")
    _status_badge("Gemini API key", bool(chat_assistant.configured_api_keys(GEMINI_API_KEY)))
    _status_badge("CricAPI key", bool(CRICAPI_KEY))
    st.markdown("---")
    st.markdown("**About this app**")
    st.caption(
        "Built on ODI/Test/T20I career leaderboards and series-history data. "
        "The chat assistant runs read-only SQL, the predictor is a logistic-regression "
        "model trained on historical head-to-head form, and live matches come from CricAPI."
    )

tab_chat, tab_predict, tab_live = st.tabs(
    ["💬 Chat Assistant", "📊 Series Predictor", "🔴 Live Matches"]
)

# ---------------------------------------------------------------- Chat tab
with tab_chat:
    st.caption("Ask questions about the batting/bowling leaderboards and series history.")
    if not chat_assistant.configured_api_keys(GEMINI_API_KEY):
        st.warning("Set GEMINI_API_KEY in your .env file to enable the chat assistant.")

    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []

    for msg in st.session_state.chat_history:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    question = st.chat_input("e.g. Compare Kohli and Tendulkar's ODI strike rate")
    if question:
        st.session_state.chat_history.append({"role": "user", "content": question})
        with st.chat_message("user"):
            st.markdown(question)
        with st.chat_message("assistant"):
            with st.spinner("Thinking..."):
                try:
                    answer = chat_assistant.ask(
                        question, st.session_state.chat_history[:-1], GEMINI_API_KEY, GEMINI_MODEL,
                        on_retry=st.info,
                    )
                except Exception as exc:  # noqa: BLE001
                    answer = f"Error: {exc}"
                st.markdown(answer)
        st.session_state.chat_history.append({"role": "assistant", "content": answer})

# ---------------------------------------------------------------- Predictor tab
with tab_predict:
    st.caption(
        "Logistic-regression model trained on historical bilateral series results "
        "(win rates, home advantage, head-to-head record) - excludes multi-team tournaments and draws."
    )

    if "series_model" not in st.session_state:
        with st.spinner("Training series prediction model..."):
            st.session_state.series_model = load_or_train()
    model = st.session_state.series_model

    fmt = st.selectbox("Format", ["ODI", "Test", "T20I"], key="predict_fmt")
    teams = model.teams_by_format.get(fmt, [])
    col1, col2 = st.columns(2)
    with col1:
        team_a = st.selectbox("Touring / Team A", teams, key="team_a")
    with col2:
        default_b_index = 1 if len(teams) > 1 else 0
        team_b = st.selectbox("Host / Team B", teams, index=default_b_index, key="team_b")
    neutral = st.checkbox("Neutral venue (no home advantage)")

    def _pct(v):
        return "-" if v is None else f"{v:.1%}"

    def _team_card(team: str, stats: dict):
        st.markdown(
            f"""
            <div class="team-card">
                <h4>{html.escape(team)}</h4>
                <div class="stat-row"><span>Matches</span><b>{stats['matches']}</b></div>
                <div class="stat-row"><span>Wins</span><b>{stats['wins']}</b></div>
                <div class="stat-row"><span>Win rate</span><b>{_pct(stats['win_rate'])}</b></div>
                <div class="stat-row"><span>Home win rate</span><b>{_pct(stats['home_win_rate'])}</b></div>
                <div class="stat-row"><span>Away win rate</span><b>{_pct(stats['away_win_rate'])}</b></div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    if st.button("Predict winner", type="primary"):
        if team_a == team_b:
            st.error("Pick two different teams.")
        else:
            prob_a = model.predict_proba(team_a, team_b, fmt, neutral=neutral)
            pct_a, pct_b = prob_a * 100, (1 - prob_a) * 100
            st.markdown(
                f"""
                <div class="prob-bar-wrap">
                    <div class="prob-bar">
                        <div class="prob-a" style="width:{pct_a:.1f}%">{html.escape(team_a)} {pct_a:.1f}%</div>
                        <div class="prob-b" style="width:{pct_b:.1f}%">{pct_b:.1f}% {html.escape(team_b)}</div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            c1, c2 = st.columns(2)
            with c1:
                _team_card(team_a, model.get_team_summary(team_a, fmt))
            with c2:
                _team_card(team_b, model.get_team_summary(team_b, fmt))

# ---------------------------------------------------------------- Live tab
with tab_live:
    st.caption("Pulls current/recent matches from CricAPI and overlays the AI series prediction.")
    if not CRICAPI_KEY:
        st.warning("Set CRICAPI_KEY in your .env file to enable live match data.")
    elif st.button("Fetch current matches"):
        try:
            matches = cricapi_client.get_current_matches(CRICAPI_KEY)
        except Exception as exc:  # noqa: BLE001
            st.error(f"CricAPI request failed: {exc}")
            matches = []

        if not matches:
            st.info("No current matches returned by CricAPI.")

        model = st.session_state.get("series_model") or load_or_train()
        for match in matches:
            teams = match.get("teams") or []
            name = match.get("name", "Unknown match")
            with st.container(border=True):
                st.markdown(f'<div class="match-card"><h4>{html.escape(name)}</h4></div>', unsafe_allow_html=True)
                st.caption(match.get("status", ""))
                if len(teams) == 2:
                    fmt_guess = "T20I" if "T20" in name else ("Test" if "Test" in name else "ODI")
                    known_teams = set(model.teams_by_format.get(fmt_guess, []))
                    if teams[0] in known_teams and teams[1] in known_teams:
                        prob = model.predict_proba(teams[0], teams[1], fmt_guess, neutral=True)
                        st.write(f"🤖 AI prediction: **{teams[0]}** win probability = {prob:.1%}")
                    else:
                        st.caption("Team names not recognized in historical dataset - no prediction.")
