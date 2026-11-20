package edu.umd.cems.catalog;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

interface CatalogRepository extends Repository<CatalogEvent, Integer> {
    String PUBLISHED_EVENTS = """
            select e.id, e.title, e.description, e.category, e.host, v.name as venue,
                   e.starts_at as "startsAt", e.ends_at as "endsAt", e.deadline as "registrationDeadline",
                   e.capacity,
                   (select cast(count(*) as integer) from registrations r
                    where r.event_id = e.id and r.status = 'confirmed') as confirmed,
                   (select cast(count(*) as integer) from registrations r
                    where r.event_id = e.id and r.status = 'waitlisted') as waitlisted
            from events e join venues v on v.id = e.venue_id
            where e.status = 'published'
            """;

    @Query(value = PUBLISHED_EVENTS + """
            and e.ends_at > now()
            and (:keyword = '' or strpos(lower(e.title), lower(:keyword)) > 0
                               or strpos(lower(e.description), lower(:keyword)) > 0)
            and (:category = '' or e.category = :category)
            and (cast(:venue as integer) is null or e.venue_id = :venue)
            order by e.starts_at, e.id
            limit :limit offset :offset
            """, nativeQuery = true)
    List<EventRow> findPublishedPage(String keyword, String category, Integer venue, int limit, long offset);

    @Query(value = PUBLISHED_EVENTS + "and e.id = :id", nativeQuery = true)
    Optional<EventRow> findPublishedEvent(int id);

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
