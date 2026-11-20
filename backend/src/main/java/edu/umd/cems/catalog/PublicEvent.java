package edu.umd.cems.catalog;

import java.time.Instant;

public record PublicEvent(
        int id,
        String title,
        String description,
        String category,
        String host,
        String venue,
        Instant startsAt,
        Instant endsAt,
        Instant registrationDeadline,
        int capacity,
        int confirmed,
        int waitlisted
) {
    static PublicEvent from(CatalogRepository.EventRow row) {
        return new PublicEvent(row.getId(), row.getTitle(), row.getDescription(), row.getCategory(),
                row.getHost(), row.getVenue(), row.getStartsAt(), row.getEndsAt(),
                row.getRegistrationDeadline(), row.getCapacity(), row.getConfirmed(), row.getWaitlisted());
    }
}
