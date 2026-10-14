// server.c - Simple HTTP server for Hospital Management System
// Compile: gcc server.c -o server -lpthread
// Run:     ./server

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <pthread.h>
#include <sys/stat.h>
#include <time.h>

#define PORT 8080
#define BUFFER_SIZE 65536
#define MAX_PATIENTS 500
#define MAX_DOCTORS 200
#define MAX_APPTS 1000

/* ---------- Data Structures ---------- */

typedef struct {
    int id;
    char name[64];
    int age;
    char gender[8];
    char phone[20];
    char disease[128];
    char doctor[64];
} Patient;

typedef struct {
    int id;
    char name[64];
    char specialization[64];
    char phone[20];
    float fees;
} Doctor;

typedef struct {
    int id;
    int patientId;
    int doctorId;
    char date[16];
    char time[8];
} Appointment;

Patient patients[MAX_PATIENTS];
Doctor doctors[MAX_DOCTORS];
Appointment appts[MAX_APPTS];

int patientCount = 0, doctorCount = 0, apptCount = 0;
int nextPatientId = 1, nextDoctorId = 1, nextApptId = 1;

pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;

/* ---------- JSON Helpers (minimal) ---------- */

// Extract a JSON string field value: "key":"value"
int json_get_string(const char *json, const char *key, char *out, int outSize) {
    char pattern[64];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *p = strstr(json, pattern);
    if (!p) return 0;
    p = strchr(p + strlen(pattern), ':');
    if (!p) return 0;
    p = strchr(p, '"');
    if (!p) return 0;
    p++;
    int i = 0;
    while (*p && *p != '"' && i < outSize - 1) {
        if (*p == '\\' && *(p + 1)) p++;
        out[i++] = *p++;
    }
    out[i] = '\0';
    return 1;
}

int json_get_int(const char *json, const char *key, int *out) {
    char pattern[64];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *p = strstr(json, pattern);
    if (!p) return 0;
    p = strchr(p + strlen(pattern), ':');
    if (!p) return 0;
    p++;
    while (*p == ' ' || *p == '"') p++;
    *out = atoi(p);
    return 1;
}

int json_get_float(const char *json, const char *key, float *out) {
    char pattern[64];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *p = strstr(json, pattern);
    if (!p) return 0;
    p = strchr(p + strlen(pattern), ':');
    if (!p) return 0;
    p++;
    while (*p == ' ' || *p == '"') p++;
    *out = atof(p);
    return 1;
}

void json_escape(const char *src, char *dst, int dstSize) {
    int j = 0;
    for (int i = 0; src[i] && j < dstSize - 2; i++) {
        if (src[i] == '"' || src[i] == '\\') {
            if (j < dstSize - 3) { dst[j++] = '\\'; dst[j++] = src[i]; }
        } else if (src[i] == '\n') {
            if (j < dstSize - 3) { dst[j++] = '\\'; dst[j++] = 'n'; }
        } else {
            dst[j++] = src[i];
        }
    }
    dst[j] = '\0';
}

/* ---------- Persistence ---------- */

void save_patients() {
    FILE *f = fopen("../data/patients.dat", "wb");
    if (!f) return;
    fwrite(&patientCount, sizeof(int), 1, f);
    fwrite(&nextPatientId, sizeof(int), 1, f);
    fwrite(patients, sizeof(Patient), patientCount, f);
    fclose(f);
}

void save_doctors() {
    FILE *f = fopen("../data/doctors.dat", "wb");
    if (!f) return;
    fwrite(&doctorCount, sizeof(int), 1, f);
    fwrite(&nextDoctorId, sizeof(int), 1, f);
    fwrite(doctors, sizeof(Doctor), doctorCount, f);
    fclose(f);
}

void save_appts() {
    FILE *f = fopen("../data/appointments.dat", "wb");
    if (!f) return;
    fwrite(&apptCount, sizeof(int), 1, f);
    fwrite(&nextApptId, sizeof(int), 1, f);
    fwrite(appts, sizeof(Appointment), apptCount, f);
    fclose(f);
}

void load_data() {
    FILE *f = fopen("../data/patients.dat", "rb");
    if (f) {
        fread(&patientCount, sizeof(int), 1, f);
        fread(&nextPatientId, sizeof(int), 1, f);
        fread(patients, sizeof(Patient), patientCount, f);
        fclose(f);
    }
    f = fopen("../data/doctors.dat", "rb");
    if (f) {
        fread(&doctorCount, sizeof(int), 1, f);
        fread(&nextDoctorId, sizeof(int), 1, f);
        fread(doctors, sizeof(Doctor), doctorCount, f);
        fclose(f);
    }
    f = fopen("../data/appointments.dat", "rb");
    if (f) {
        fread(&apptCount, sizeof(int), 1, f);
        fread(&nextApptId, sizeof(int), 1, f);
        fread(appts, sizeof(Appointment), apptCount, f);
        fclose(f);
    }
}

/* ---------- Find Helpers ---------- */

int find_patient(int id) {
    for (int i = 0; i < patientCount; i++) if (patients[i].id == id) return i;
    return -1;
}
int find_doctor(int id) {
    for (int i = 0; i < doctorCount; i++) if (doctors[i].id == id) return i;
    return -1;
}
int find_appt(int id) {
    for (int i = 0; i < apptCount; i++) if (appts[i].id == id) return i;
    return -1;
}

/* ---------- Response Helpers ---------- */

void send_response(int client, int code, const char *ctype, const char *body, int bodyLen) {
    char header[512];
    const char *status = (code == 200) ? "200 OK" :
                         (code == 201) ? "201 Created" :
                         (code == 400) ? "400 Bad Request" :
                         (code == 404) ? "404 Not Found" : "500 Error";
    int hlen = snprintf(header, sizeof(header),
        "HTTP/1.1 %s\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %d\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n"
        "Connection: close\r\n\r\n",
        status, ctype, bodyLen);
    write(client, header, hlen);
    if (bodyLen > 0) write(client, body, bodyLen);
}

void send_json(int client, int code, const char *json) {
    send_response(client, code, "application/json", json, strlen(json));
}

/* ---------- Static File Serving ---------- */

const char* get_mime(const char *path) {
    if (strstr(path, ".html")) return "text/html";
    if (strstr(path, ".css"))  return "text/css";
    if (strstr(path, ".js"))   return "application/javascript";
    if (strstr(path, ".png"))  return "image/png";
    if (strstr(path, ".jpg"))  return "image/jpeg";
    return "text/plain";
}

void serve_file(int client, const char *urlPath) {
    char filepath[256];
    if (strcmp(urlPath, "/") == 0) strcpy(filepath, "../frontend/index.html");
    else snprintf(filepath, sizeof(filepath), "../frontend%s", urlPath);

    FILE *f = fopen(filepath, "rb");
    if (!f) {
        const char *msg = "404 Not Found";
        send_response(client, 404, "text/plain", msg, strlen(msg));
        return;
    }

    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *buf = malloc(size);
    fread(buf, 1, size, f);
    fclose(f);

    send_response(client, 200, get_mime(filepath), buf, size);
    free(buf);
}

/* ---------- API Handlers ---------- */

void handle_get_patients(int client) {
    char *buf = malloc(128 * 1024);
    int pos = 0;
    pos += sprintf(buf + pos, "[");
    for (int i = 0; i < patientCount; i++) {
        char name[128], phone[64], disease[256], doctor[128];
        json_escape(patients[i].name, name, sizeof(name));
        json_escape(patients[i].phone, phone, sizeof(phone));
        json_escape(patients[i].disease, disease, sizeof(disease));
        json_escape(patients[i].doctor, doctor, sizeof(doctor));
        pos += sprintf(buf + pos,
            "%s{\"id\":%d,\"name\":\"%s\",\"age\":%d,\"gender\":\"%s\","
            "\"phone\":\"%s\",\"disease\":\"%s\",\"doctor\":\"%s\"}",
            i ? "," : "", patients[i].id, name, patients[i].age,
            patients[i].gender, phone, disease, doctor);
    }
    pos += sprintf(buf + pos, "]");
    send_json(client, 200, buf);
    free(buf);
}

void handle_get_doctors(int client) {
    char *buf = malloc(64 * 1024);
    int pos = 0;
    pos += sprintf(buf + pos, "[");
    for (int i = 0; i < doctorCount; i++) {
        char name[128], spec[128], phone[64];
        json_escape(doctors[i].name, name, sizeof(name));
        json_escape(doctors[i].specialization, spec, sizeof(spec));
        json_escape(doctors[i].phone, phone, sizeof(phone));
        pos += sprintf(buf + pos,
            "%s{\"id\":%d,\"name\":\"%s\",\"specialization\":\"%s\","
            "\"phone\":\"%s\",\"fees\":%.2f}",
            i ? "," : "", doctors[i].id, name, spec, phone, doctors[i].fees);
    }
    pos += sprintf(buf + pos, "]");
    send_json(client, 200, buf);
    free(buf);
}

void handle_get_appts(int client) {
    char *buf = malloc(128 * 1024);
    int pos = 0;
    pos += sprintf(buf + pos, "[");
    for (int i = 0; i < apptCount; i++) {
        int pi = find_patient(appts[i].patientId);
        int di = find_doctor(appts[i].doctorId);
        char pname[128] = "Unknown", dname[128] = "Unknown";
        if (pi != -1) json_escape(patients[pi].name, pname, sizeof(pname));
        if (di != -1) json_escape(doctors[di].name, dname, sizeof(dname));
        pos += sprintf(buf + pos,
            "%s{\"id\":%d,\"patientId\":%d,\"patientName\":\"%s\","
            "\"doctorId\":%d,\"doctorName\":\"%s\",\"date\":\"%s\",\"time\":\"%s\"}",
            i ? "," : "", appts[i].id, appts[i].patientId, pname,
            appts[i].doctorId, dname, appts[i].date, appts[i].time);
    }
    pos += sprintf(buf + pos, "]");
    send_json(client, 200, buf);
    free(buf);
}

void handle_post_patient(int client, const char *body) {
    if (patientCount >= MAX_PATIENTS) { send_json(client, 400, "{\"error\":\"limit\"}"); return; }
    Patient p;
    p.id = nextPatientId++;
    json_get_string(body, "name", p.name, sizeof(p.name));
    json_get_int(body, "age", &p.age);
    json_get_string(body, "gender", p.gender, sizeof(p.gender));
    json_get_string(body, "phone", p.phone, sizeof(p.phone));
    json_get_string(body, "disease", p.disease, sizeof(p.disease));
    json_get_string(body, "doctor", p.doctor, sizeof(p.doctor));

    pthread_mutex_lock(&lock);
    patients[patientCount++] = p;
    save_patients();
    pthread_mutex_unlock(&lock);

    char resp[256];
    snprintf(resp, sizeof(resp), "{\"id\":%d,\"message\":\"created\"}", p.id);
    send_json(client, 201, resp);
}

void handle_post_doctor(int client, const char *body) {
    if (doctorCount >= MAX_DOCTORS) { send_json(client, 400, "{\"error\":\"limit\"}"); return; }
    Doctor d;
    d.id = nextDoctorId++;
    json_get_string(body, "name", d.name, sizeof(d.name));
    json_get_string(body, "specialization", d.specialization, sizeof(d.specialization));
    json_get_string(body, "phone", d.phone, sizeof(d.phone));
    json_get_float(body, "fees", &d.fees);

    pthread_mutex_lock(&lock);
    doctors[doctorCount++] = d;
    save_doctors();
    pthread_mutex_unlock(&lock);

    char resp[256];
    snprintf(resp, sizeof(resp), "{\"id\":%d,\"message\":\"created\"}", d.id);
    send_json(client, 201, resp);
}

void handle_post_appt(int client, const char *body) {
    if (apptCount >= MAX_APPTS) { send_json(client, 400, "{\"error\":\"limit\"}"); return; }
    Appointment a;
    a.id = nextApptId++;
    json_get_int(body, "patientId", &a.patientId);
    json_get_int(body, "doctorId", &a.doctorId);
    json_get_string(body, "date", a.date, sizeof(a.date));
    json_get_string(body, "time", a.time, sizeof(a.time));

    int pi = find_patient(a.patientId);
    int di = find_doctor(a.doctorId);
    if (pi == -1 || di == -1) { send_json(client, 400, "{\"error\":\"invalid ids\"}"); return; }

    pthread_mutex_lock(&lock);
    appts[apptCount++] = a;
    // Assign doctor name to patient record
    strcpy(patients[pi].doctor, doctors[di].name);
    save_appts();
    save_patients();
    pthread_mutex_unlock(&lock);

    char resp[256];
    snprintf(resp, sizeof(resp), "{\"id\":%d,\"message\":\"booked\"}", a.id);
    send_json(client, 201, resp);
}

void handle_delete_patient(int client, int id) {
    pthread_mutex_lock(&lock);
    int idx = find_patient(id);
    if (idx == -1) { pthread_mutex_unlock(&lock); send_json(client, 404, "{\"error\":\"not found\"}"); return; }
    for (int i = idx; i < patientCount - 1; i++) patients[i] = patients[i + 1];
    patientCount--;
    save_patients();
    pthread_mutex_unlock(&lock);
    send_json(client, 200, "{\"message\":\"deleted\"}");
}

void handle_delete_doctor(int client, int id) {
    pthread_mutex_lock(&lock);
    int idx = find_doctor(id);
    if (idx == -1) { pthread_mutex_unlock(&lock); send_json(client, 404, "{\"error\":\"not found\"}"); return; }
    for (int i = idx; i < doctorCount - 1; i++) doctors[i] = doctors[i + 1];
    doctorCount--;
    save_doctors();
    pthread_mutex_unlock(&lock);
    send_json(client, 200, "{\"message\":\"deleted\"}");
}

void handle_delete_appt(int client, int id) {
    pthread_mutex_lock(&lock);
    int idx = find_appt(id);
    if (idx == -1) { pthread_mutex_unlock(&lock); send_json(client, 404, "{\"error\":\"not found\"}"); return; }
    for (int i = idx; i < apptCount - 1; i++) appts[i] = appts[i + 1];
    apptCount--;
    save_appts();
    pthread_mutex_unlock(&lock);
    send_json(client, 200, "{\"message\":\"cancelled\"}");
}

/* ---------- Router ---------- */

void route(int client, const char *method, const char *path, const char *body) {
    if (strcmp(method, "OPTIONS") == 0) { send_response(client, 200, "text/plain", "", 0); return; }

    // ----- API -----
    if (strcmp(path, "/api/patients") == 0) {
        if (strcmp(method, "GET") == 0)  handle_get_patients(client);
        else if (strcmp(method, "POST") == 0) handle_post_patient(client, body);
        else send_json(client, 400, "{\"error\":\"method\"}");
        return;
    }
    if (strncmp(path, "/api/patients/", 14) == 0) {
        int id = atoi(path + 14);
        if (strcmp(method, "DELETE") == 0) handle_delete_patient(client, id);
        return;
    }
    if (strcmp(path, "/api/doctors") == 0) {
        if (strcmp(method, "GET") == 0)  handle_get_doctors(client);
        else if (strcmp(method, "POST") == 0) handle_post_doctor(client, body);
        return;
    }
    if (strncmp(path, "/api/doctors/", 13) == 0) {
        int id = atoi(path + 13);
        if (strcmp(method, "DELETE") == 0) handle_delete_doctor(client, id);
        return;
    }
    if (strcmp(path, "/api/appointments") == 0) {
        if (strcmp(method, "GET") == 0)  handle_get_appts(client);
        else if (strcmp(method, "POST") == 0) handle_post_appt(client, body);
        return;
    }
    if (strncmp(path, "/api/appointments/", 18) == 0) {
        int id = atoi(path + 18);
        if (strcmp(method, "DELETE") == 0) handle_delete_appt(client, id);
        return;
    }
    if (strcmp(path, "/api/stats") == 0) {
        char buf[256];
        snprintf(buf, sizeof(buf),
            "{\"patients\":%d,\"doctors\":%d,\"appointments\":%d}",
            patientCount, doctorCount, apptCount);
        send_json(client, 200, buf);
        return;
    }

    // ----- Static files -----
    serve_file(client, path);
}

/* ---------- Client Thread ---------- */

void *client_thread(void *arg) {
    int client = *(int *)arg;
    free(arg);

    char buffer[BUFFER_SIZE];
    int n = read(client, buffer, BUFFER_SIZE - 1);
    if (n <= 0) { close(client); return NULL; }
    buffer[n] = '\0';

    char method[8], path[256];
    sscanf(buffer, "%7s %255s", method, path);

    // Find body
    char *body = strstr(buffer, "\r\n\r\n");
    body = body ? body + 4 : "";

    printf("[REQ] %s %s\n", method, path);
    route(client, method, path, body);
    close(client);
    return NULL;
}

/* ---------- Main ---------- */

int main() {
    // Ensure data directory exists
    mkdir("../data", 0755);

    load_data();

    // Seed sample doctors on first run
    if (doctorCount == 0) {
        Doctor d1 = {nextDoctorId++, "Dr. Smith", "Cardiology", "555-0101", 150.0f};
        Doctor d2 = {nextDoctorId++, "Dr. Jane", "Pediatrics", "555-0102", 100.0f};
        Doctor d3 = {nextDoctorId++, "Dr. Lee", "Orthopedics", "555-0103", 200.0f};
        doctors[doctorCount++] = d1;
        doctors[doctorCount++] = d2;
        doctors[doctorCount++] = d3;
        save_doctors();
    }

    int server = socket(AF_INET, SOCK_STREAM, 0);
    if (server < 0) { perror("socket"); return 1; }

    int opt = 1;
    setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(PORT);

    if (bind(server, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind"); return 1;
    }
    if (listen(server, 20) < 0) { perror("listen"); return 1; }

    printf("========================================\n");
    printf("  Hospital Management Server\n");
    printf("  Listening on http://localhost:%d\n", PORT);
    printf("========================================\n");

    while (1) {
        struct sockaddr_in caddr;
        socklen_t clen = sizeof(caddr);
        int client = accept(server, (struct sockaddr *)&caddr, &clen);
        if (client < 0) continue;

        int *cp = malloc(sizeof(int));
        *cp = client;
        pthread_t tid;
        pthread_create(&tid, NULL, client_thread, cp);
        pthread_detach(tid);
    }

    close(server);
    return 0;
}