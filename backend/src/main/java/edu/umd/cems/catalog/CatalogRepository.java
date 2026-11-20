package edu.umd.cems.catalog;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

interface CatalogRepository extends Repository<CatalogEvent, Integer> {
    String PUBLISHED_EVENTS = """
            select e.id, e.title, e.description, e.category, e.host, e.venue,
                   e.starts_at as "startsAt", e.ends_at as "endsAt", e.deadline as "registrationDeadline",
                   e.capacity, e.confirmed, e.waitlisted
            from cems_catalog.published_events e
            """;

    @Query(value = PUBLISHED_EVENTS + """
            where e.ends_at > now()
            and (:keyword = '' or strpos(lower(e.title), lower(:keyword)) > 0
                               or strpos(lower(e.description), lower(:keyword)) > 0)
            and (:category = '' or e.category = :category)
            and (cast(:venue as integer) is null or e.venue_id = :venue)
            order by e.starts_at, e.id
            limit :limit offset :offset
            """, nativeQuery = true)
    List<EventRow> findPublishedPage(String keyword, String category, Integer venue, int limit, long offset);

    @Query(value = PUBLISHED_EVENTS + "where e.id = :id", nativeQuery = true)
    Optional<EventRow> findPublishedEvent(int id);

    @Query(value = "select id, name from cems_catalog.venues order by name, id", nativeQuery = true)
    List<VenueRow> findVenues();

    interface VenueRow {
        int getId();
        String getName();
    }

    interface EventRow {
        int getId();
        String getTitle();
        String getDescription();
        String getCategory();
        String getHost();
        String getVenue();
        Instant getStartsAt();
        Instant getEndsAt();
        Instant getRegistrationDeadline();
        int getCapacity();
        int getConfirmed();
        int getWaitlisted();
    }
}
