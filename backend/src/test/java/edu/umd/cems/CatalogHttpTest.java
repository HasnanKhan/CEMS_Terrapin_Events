package edu.umd.cems;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

@SpringBootTest(webEnvironment = RANDOM_PORT)
class CatalogHttpTest {
    @Autowired
    private TestRestTemplate http;

    @Test
    void appliesLiteralSearchCategoryVenueAndStablePaging() {
        String path = "/api/events?q={search}&category=Academic&venue=810001&page={page}";
        JsonNode first = json(path, "  sPrInG fair %_  ", 1);
        assertThat(first.path("events")).extracting(event -> event.path("id").asInt())
                .containsExactlyElementsOf(IntStream.rangeClosed(820001, 820012).boxed().toList());
        assertThat(first.path("page").asInt()).isEqualTo(1);
        assertThat(first.path("hasNext").asBoolean()).isTrue();
        JsonNode second = json(path, "Spring fair %_", 2);
        assertThat(second.path("events")).extracting(event -> event.path("id").asInt()).containsExactly(820013);
        assertThat(second.path("page").asInt()).isEqualTo(2);
        assertThat(second.path("hasNext").asBoolean()).isFalse();
        assertThat(json(path, "Spring fair %_", Integer.MAX_VALUE).path("events").isEmpty()).isTrue();
    }

    @Test
    void searchesDescriptionsAndListsOngoingEventsWithClosedRegistration() {
        JsonNode matches = json("/api/events?q={search}", "MAKER WORKSHOP");
        assertThat(matches.path("events").size()).isEqualTo(12);
        JsonNode ongoing = json("/api/events?q={search}", "Catalog fixture ongoing").path("events").get(0);
        assertThat(ongoing.path("id").asInt()).isEqualTo(820017);
        assertThat(Instant.parse(ongoing.path("registrationDeadline").asText()))
                .isBefore(Instant.now());
        assertThat(json("/api/events?q={search}", "Spring fair %_ past").path("events").isEmpty()).isTrue();
    }

    @Test
    void publishesOnlyThePublicFieldsAndCounts() {
        JsonNode event = json("/api/events/820001");
        assertThat(event.fieldNames()).toIterable().containsExactlyInAnyOrder(
                "id", "title", "description", "category", "host", "venue", "startsAt", "endsAt",
                "registrationDeadline", "capacity", "confirmed", "waitlisted");
        assertThat(event.path("title").asText()).isEqualTo("Spring fair %_ 1");
        assertThat(event.path("venue").asText()).isEqualTo("Catalog fixture hall");
        assertThat(event.path("capacity").asInt()).isEqualTo(2);
        assertThat(event.path("confirmed").asInt()).isEqualTo(2);
        assertThat(event.path("waitlisted").asInt()).isEqualTo(1);
        assertThat(Instant.parse(event.path("endsAt").asText()))
                .isAfter(Instant.parse(event.path("startsAt").asText()));
        assertThat(json("/api/events/820016").path("title").asText()).endsWith("past");
    }

    @Test
    void deniesWritesAndPrivateRoutesAndHidesNonPublicEvents() {
        for (int id : new int[]{820014, 820015, 829999}) {
            var response = http.getForEntity("/api/events/" + id, String.class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(response.getBody()).isNull();
        }
        assertThat(http.getForEntity("/api/events/export", String.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(http.getForEntity("/api/events/820001/roster", String.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(http.postForEntity("/api/events", null, String.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void rejectsInvalidFilters() {
        for (String query : new String[]{"page=0", "page=abc", "venue=0", "category=invalid", "q=" + "a".repeat(101),
                "q=one&q=two", "category=Academic&category=Community", "venue=1&venue=2", "page=1&page=2",
                "unknown=value"}) {
            assertThat(http.getForEntity("/api/events?" + query, String.class).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }
        var invalidSearch = http.getForEntity("/api/events?q={term}", String.class, "control\0value");
        assertThat(invalidSearch.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(invalidSearch.getBody()).isNull();
    }

    @Test
    void listsOnlyPublicVenueFieldsAndDeniesVenueWrites() {
        JsonNode venues = json("/api/venues");
        assertThat(venues).extracting(venue -> venue.path("name").asText()).containsExactly(
                "Catalog fixture hall", "Catalog fixture studio", "Hornbake Library",
                "Iribe Center", "McKeldin Library", "Stamp Student Union");
        for (JsonNode venue : venues) {
            assertThat(venue.fieldNames()).toIterable().containsExactlyInAnyOrder("id", "name");
            assertThat(venue.path("id").asInt()).isPositive();
        }
        assertThat(http.postForEntity("/api/venues", null, String.class).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void keepsResponsesUncachedAndDisallowsCrossOriginPreflight() {
        var venues = http.getForEntity("/api/venues", String.class);
        assertThat(venues.getHeaders().getCacheControl()).contains("no-store");
        assertThat(venues.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        var headers = new HttpHeaders();
        headers.setOrigin("https://other.example");
        headers.setAccessControlRequestMethod(HttpMethod.GET);
        var preflight = http.exchange("/api/venues", HttpMethod.OPTIONS, new HttpEntity<>(headers), String.class);
        assertThat(preflight.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(preflight.getHeaders().getAccessControlAllowOrigin()).isNull();
    }

    private JsonNode json(String path, Object... variables) {
        var response = http.getForEntity(path, JsonNode.class, variables);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }
}
