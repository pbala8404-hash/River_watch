#include <Arduino.h>

const int TRIG_PIN   = 5;
const int ECHO_PIN   = 18;
const int LED_SAFE    = 25;
const int LED_WARNING = 26;
const int LED_DANGER  = 27;
const int BUZZER_PIN  = 14;


const char* LOCATION  = "Anaikatti Bridge";
const char* DEVICE_ID = "DEV-01";

// ---- Geometry: sensor is mounted GANTRY_HEIGHT_M above the pillar's zero mark ----
const float GANTRY_HEIGHT_M = 6.0;   // distance from sensor to river bed / zero mark
const float MIN_PLAUSIBLE_M = 0.0;   // river can't go below the pillar's zero mark
const float MAX_PLAUSIBLE_M = 6.0;   // physical ceiling of this gauge

// ---- Thresholds (match dashboard) ----
const float WARNING_THRESHOLD_M = 2.5;
const float DANGER_THRESHOLD_M  = 3.5;

// ---- Timing: non-blocking sample schedule ----
const unsigned long SAMPLE_INTERVAL_MS = 4000; // simulated "4-hour" tick, compressed for demo
unsigned long lastSampleAt = 0;
unsigned long readingCounter = 0;

// ---- Smoothing: simple moving average over N samples ----
const int SMOOTH_WINDOW = 5;
float smoothBuffer[SMOOTH_WINDOW];
int smoothIndex = 0;
int smoothFilled = 0;

// ---- Last known-good level, used when a raw sample fails the plausibility check ----
float lastGoodLevel = -1;
bool haveGoodReading = false;

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_SAFE, OUTPUT);
  pinMode(LED_WARNING, OUTPUT);
  pinMode(LED_DANGER, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println("{\"event\":\"boot\",\"device_id\":\"DEV-01\",\"note\":\"sensing node online, no network required for local warning\"}");
}

void loop() {
  // Non-blocking schedule: everything else (LEDs, buzzer, serial) keeps running
  // between samples instead of the CPU sitting inside a delay().
  unsigned long now = millis();
  if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
    lastSampleAt = now;
    takeSample();
  }
}

void takeSample() {
  float distance_m = readUltrasonicDistanceMeters();
  float rawLevel_m = GANTRY_HEIGHT_M - distance_m; // higher water = shorter distance = higher level

  bool plausible = isPlausible(rawLevel_m);
  float levelToUse;
  bool usedFallback = false;

  if (plausible) {
    levelToUse = rawLevel_m;
    lastGoodLevel = rawLevel_m;
    haveGoodReading = true;
  } else if (haveGoodReading) {
    // Reject the spike outright rather than let it corrupt the average;
    // hold the last known-good level until a plausible sample returns.
    levelToUse = lastGoodLevel;
    usedFallback = true;
  } else {
    levelToUse = 0;
    usedFallback = true;
  }

  float smoothed = smooth(levelToUse);

  const char* status = statusFor(smoothed);
  updateLocalWarning(status);

  emitReading(rawLevel_m, plausible, smoothed, status, usedFallback);
  readingCounter++;
}

// Wokwi's HC-SR04 model returns real timing via pulseIn — this works unmodified
// in simulation and on real hardware.
float readUltrasonicDistanceMeters() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration_us = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout guards against a hung echo
  if (duration_us == 0) {
    return GANTRY_HEIGHT_M; // no echo -> report as level 0 (safely implausible-free reading)
  }
  float distance_cm = (duration_us * 0.0343) / 2.0;
  return distance_cm / 100.0;
}

bool isPlausible(float level_m) {
  return level_m >= MIN_PLAUSIBLE_M && level_m <= MAX_PLAUSIBLE_M;
}

// Moving-average smoothing: one wild spike is diluted across the window
// instead of being read as a real jump in river level.
float smooth(float value) {
  smoothBuffer[smoothIndex] = value;
  smoothIndex = (smoothIndex + 1) % SMOOTH_WINDOW;
  if (smoothFilled < SMOOTH_WINDOW) smoothFilled++;

  float sum = 0;
  for (int i = 0; i < smoothFilled; i++) sum += smoothBuffer[i];
  return sum / smoothFilled;
}

const char* statusFor(float level_m) {
  if (level_m >= DANGER_THRESHOLD_M) return "danger";
  if (level_m >= WARNING_THRESHOLD_M) return "warning";
  return "normal";
}

// This is the "even without network coverage" requirement: the local
// LED/buzzer warning is driven entirely from the on-device smoothed
// reading, with no dependency on Wi-Fi, MQTT, or the control room.
void updateLocalWarning(const char* status) {
  digitalWrite(LED_SAFE, LOW);
  digitalWrite(LED_WARNING, LOW);
  digitalWrite(LED_DANGER, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  if (strcmp(status, "danger") == 0) {
    digitalWrite(LED_DANGER, HIGH);
    digitalWrite(BUZZER_PIN, HIGH);
  } else if (strcmp(status, "warning") == 0) {
    digitalWrite(LED_WARNING, HIGH);
  } else {
    digitalWrite(LED_SAFE, HIGH);
  }
}

// Emits one JSON line matching the dashboard's reading schema, so a serial
// bridge script can append these straight into data/readings.json.
void emitReading(float rawLevel, bool plausible, float smoothed, const char* status, bool usedFallback) {
  Serial.print("{");
  Serial.print("\"reading_id\":\"SIM"); Serial.print(readingCounter); Serial.print("\",");
  Serial.print("\"location\":\""); Serial.print(LOCATION); Serial.print("\",");
  Serial.print("\"water_level_m\":"); Serial.print(smoothed, 2); Serial.print(",");
  Serial.print("\"status\":\""); Serial.print(status); Serial.print("\",");
  Serial.print("\"device_id\":\""); Serial.print(DEVICE_ID); Serial.print("\",");
  Serial.print("\"raw_level_m\":"); Serial.print(rawLevel, 2); Serial.print(",");
  Serial.print("\"plausible\":"); Serial.print(plausible ? "true" : "false"); Serial.print(",");
  Serial.print("\"used_last_good\":"); Serial.print(usedFallback ? "true" : "false");
  Serial.println("}");
}
