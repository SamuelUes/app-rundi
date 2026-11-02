// Package apperr — errores de dominio → HTTP (doc §7.1: 409 en conflicto).
package apperr

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
)

type Error struct {
	Code    int    `json:"-"`
	Message string `json:"error"`
}

func (e *Error) Error() string { return e.Message }

func New(code int, msg string) *Error { return &Error{Code: code, Message: msg} }

var (
	ErrConflict   = New(http.StatusConflict, "conflict")
	ErrNotFound   = New(http.StatusNotFound, "not found")
	ErrForbidden  = New(http.StatusForbidden, "forbidden")
	ErrBadRequest = New(http.StatusBadRequest, "bad request")
)

// Write serializa el error de dominio; genéricos → 500.
func Write(w http.ResponseWriter, err error) {
	var ae *Error
	if !errors.As(err, &ae) {
		log.Printf("ERROR unhandled: %v", err)
		ae = New(http.StatusInternalServerError, "internal error")
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(ae.Code)
	_ = json.NewEncoder(w).Encode(ae)
}

func JSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
