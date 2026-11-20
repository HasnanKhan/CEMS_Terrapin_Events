package edu.umd.cems;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

@SpringBootTest(webEnvironment = RANDOM_PORT)
class BackendHealthTest {
    @Autowired
    private TestRestTemplate http;

    @Test
    void exposesOnlyTheHealthProbes() {
        for (String path : new String[]{"/actuator/health/liveness", "/actuator/health/readiness"}) {
            var response = http.getForEntity(path, JsonNode.class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody().toString()).isEqualTo("{\"status\":\"UP\"}");
        }
        for (String path : new String[]{"/", "/actuator", "/actuator/health", "/actuator/env", "/error"}) {
            assertThat(http.getForEntity(path, String.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        }
        assertThat(http.postForEntity("/actuator/health/readiness", null, String.class).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }
}
