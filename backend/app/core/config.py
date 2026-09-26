from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./gymlens.db"
    auth0_domain: str = ""
    auth0_audience: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    cors_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]


settings = Settings()
