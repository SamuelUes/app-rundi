// Fechas de compliance — port de dateUtils.ts. Todas las comparaciones usan
// DATE calendario en America/Managua ('YYYY-MM-DD', comparable lexicográfico).
package compliance

import (
	"strings"
	"time"
)

var managuaLoc = func() *time.Location {
	l, err := time.LoadLocation("America/Managua")
	if err != nil {
		return time.UTC
	}
	return l
}()

// TodayNicaragua — día calendario actual en Nicaragua 'YYYY-MM-DD'.
func TodayNicaragua() string {
	return time.Now().In(managuaLoc).Format("2006-01-02")
}

// toDateOnly — normaliza a 'YYYY-MM-DD'; "" si inválido.
func toDateOnly(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case time.Time:
		return t.Format("2006-01-02")
	case *time.Time:
		if t == nil {
			return ""
		}
		return t.Format("2006-01-02")
	case *string:
		if t == nil {
			return ""
		}
		return toDateOnly(*t)
	case string:
		s := strings.TrimSpace(t)
		if len(s) >= 10 && s[4] == '-' && s[7] == '-' {
			return s[:10]
		}
		return ""
	}
	return ""
}

func toDays(dateOnly string) int {
	t, err := time.Parse("2006-01-02", dateOnly)
	if err != nil {
		return 0
	}
	return int(t.Unix() / 86400)
}

func compareDates(a, b string) int {
	if a < b {
		return -1
	}
	if a > b {
		return 1
	}
	return 0
}

func isExpired(expiry, today string) bool {
	d := toDateOnly(expiry)
	return d != "" && compareDates(d, today) < 0
}

func isNotYetValid(start, today string) bool {
	d := toDateOnly(start)
	return d != "" && compareDates(d, today) > 0
}

func isExpiringSoon(expiry, today string, warningDays int) bool {
	d := toDateOnly(expiry)
	if d == "" {
		return false
	}
	diff := toDays(d) - toDays(today)
	return diff >= 0 && diff <= warningDays
}

func daysUntil(expiry, today string) int {
	d := toDateOnly(expiry)
	if d == "" {
		return 0
	}
	return toDays(d) - toDays(today)
}

func yearOf(dateOnly string) int {
	if len(dateOnly) < 4 {
		return 0
	}
	y := 0
	for _, c := range dateOnly[:4] {
		y = y*10 + int(c-'0')
	}
	return y
}

// isWithinTaxGracePeriod — pago de rodamiento hasta el 31 de marzo (Ley 431 Art. 11).
func isWithinTaxGracePeriod(today string) bool {
	if len(today) < 10 {
		return false
	}
	m := (today[5]-'0')*10 + (today[6] - '0')
	d := (today[8]-'0')*10 + (today[9] - '0')
	return m < 3 || (m == 3 && d <= 31)
}
