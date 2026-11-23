package edu.umd.cems;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

@SpringBootTest(webEnvironment = RANDOM_PORT, properties = "cems.session.enabled=true")
class SessionHttpTest {
    private static final String PATH = "/internal/session/resolve";

    @Autowired
    private TestRestTemplate http;
    @Value("${cems.session.db-url}")
    private String url;
    @Value("${cems.session.db-user}")
    private String identityUser;
    @Value("${cems.session.db-password}")
    private String identityPassword;
    @Value("${CEMS_TEST_DB_OWNER_USER}")
    private String owner;
    @Value("${CEMS_TEST_DB_OWNER_PASSWORD}")
    private String ownerPassword;
    @Value("${cems.session.service-token}")
    private String token;

    @Test
    void authenticatesTheInternalPostAndReturnsOnlySessionProfileFields() {
        var response = resolve("aa".repeat(32), "Bearer " + token);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getCacheControl()).contains("no-store");
        assertThat(response.getHeaders().get(HttpHeaders.SET_COOKIE)).isNull();
        JsonNode profile = response.getBody();
        assertThat(profile.fieldNames()).toIterable().containsExactlyInAnyOrder("id", "name", "email", "roles");
        assertThat(profile.path("id").asInt()).isEqualTo(810002);
        assertThat(profile.path("email").asText()).isEqualTo("catalog-a@fixture.invalid");
        assertThat(profile.path("roles")).extracting(JsonNode::asText).containsExactly("attendee");
        assertThat(http.getForEntity(PATH, String.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        for (String credential : new String[]{null, "Bearer " + "ff".repeat(32)}) {
            var denied = resolve("aa".repeat(32), credential);
            assertThat(denied.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            assertThat(denied.getBody()).isNull();
        }
        assertThat(resolve("not-a-hash", "Bearer " + token).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void checksIdleAndAbsoluteExpiryAndDeactivatedAccounts() {
        for (String key : new String[]{"cc", "dd", "ee", "ff"}) {
            var response = resolve(key.repeat(32), "Bearer " + token);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
            assertThat(response.getBody()).isNull();
        }
    }

    @Test
    void capsTheRenewedIdleDeadlineAtTheAbsoluteDeadline() throws SQLException {
        String hash = "bb".repeat(32);
        OffsetDateTime original = expiry(hash, false);
        OffsetDateTime cap = expiry(hash, true);
        assertThat(resolve(hash, "Bearer " + token).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(expiry(hash, false)).isAfter(original).isEqualTo(cap);
    }

    @Test
    void restrictsTheIdentityLoginToOneFunction() throws SQLException {
        try (var db = DriverManager.getConnection(url, identityUser, identityPassword)) {
            for (String query : new String[]{
                    "select token_hash from public.sessions where false",
                    "select password_hash from public.accounts where false",
                    "delete from public.sessions where false",
                    "select id from cems_catalog.published_events where false"
            }) {
                try (var statement = db.createStatement()) {
                    assertThatThrownBy(() -> statement.execute(query))
                            .isInstanceOfSatisfying(SQLException.class, sql -> assertThat(sql.getSQLState()).isEqualTo("42501"));
                }
            }
            try (var statement = db.createStatement();
                 var rows = statement.executeQuery("select has_schema_privilege('cems_identity', 'CREATE')")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getBoolean(1)).isFalse();
            }
        }
    }

    private OffsetDateTime expiry(String hash, boolean absolute) throws SQLException {
        String sql = absolute
                ? "select absolute_expires_at from public.sessions where token_hash = ?"
                : "select expires_at from public.sessions where token_hash = ?";
        try (var db = DriverManager.getConnection(url, owner, ownerPassword);
             var statement = db.prepareStatement(sql)) {
            statement.setString(1, hash);
            try (var rows = statement.executeQuery()) {
                assertThat(rows.next()).isTrue();
                return rows.getObject(1, OffsetDateTime.class);
            }
        }
    }

    private ResponseEntity<JsonNode> resolve(String hash, String credential) {
        var headers = new HttpHeaders();
        if (credential != null) headers.set(HttpHeaders.AUTHORIZATION, credential);
        headers.set("X-CEMS-Session-Hash", hash);
        return http.exchange(PATH, HttpMethod.POST, new HttpEntity<>(headers), JsonNode.class);
    }
}
