package edu.umd.cems;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

@SpringBootTest(webEnvironment = RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:postgresql://127.0.0.1:1/terrapin",
        "spring.datasource.username=unavailable",
        "spring.datasource.password=unavailable",
        "spring.datasource.hikari.connection-timeout=350",
        "spring.datasource.hikari.validation-timeout=250"
})
class DatabaseUnavailableTest {
    @Autowired
    private TestRestTemplate http;

    @Test
    void remainsLiveWhileReadinessReportsTheDatabaseFailure() {
        assertThat(http.getForEntity("/actuator/health/liveness", JsonNode.class).getStatusCode())
                .isEqualTo(HttpStatus.OK);
        var readiness = http.getForEntity("/actuator/health/readiness", JsonNode.class);
        assertThat(readiness.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(readiness.getBody().toString()).isEqualTo("{\"status\":\"DOWN\"}");
    }

    @Test
    void returnsAnEmpty503FromTheCatalogIfTheDatabaseIsDown() {
        for (String path : new String[]{"/api/events", "/api/events/820001", "/api/venues"}) {
            var response = http.getForEntity(path, String.class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
            assertThat(response.getBody()).isNull();
        }
    }
}
