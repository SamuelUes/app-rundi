package config

import "testing"

func TestLoad_RequiresProjectAndInstance(t *testing.T) {
	t.Setenv("GCP_PROJECT_ID", "")
	t.Setenv("INSTANCE_CONNECTION_NAME", "")
	if _, err := Load(); err == nil {
		t.Fatal("esperaba error por vars requeridas ausentes")
	}
}

func TestLoad_Defaults(t *testing.T) {
	t.Setenv("GCP_PROJECT_ID", "test-proj")
	t.Setenv("INSTANCE_CONNECTION_NAME", "p:r:i")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.DBPoolMax != 5 {
		t.Errorf("DB_POOL_MAX default=%d want 5", cfg.DBPoolMax)
	}
	if cfg.DBStatementTimeout.Milliseconds() != 10000 {
		t.Errorf("timeout default=%v want 10s", cfg.DBStatementTimeout)
	}
	if cfg.AppCheckEnforce != "monitor" {
		t.Errorf("APP_CHECK_ENFORCE default=%q want monitor", cfg.AppCheckEnforce)
	}
	if cfg.Region != "us-central1" {
		t.Errorf("REGION default=%q want us-central1 (Firestore location)", cfg.Region)
	}
}

func TestLoad_InvalidAppCheckMode(t *testing.T) {
	t.Setenv("GCP_PROJECT_ID", "p")
	t.Setenv("INSTANCE_CONNECTION_NAME", "p:r:i")
	t.Setenv("APP_CHECK_ENFORCE", "bogus")
	if _, err := Load(); err == nil {
		t.Fatal("esperaba error por APP_CHECK_ENFORCE inválido")
	}
}
