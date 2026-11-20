package edu.umd.cems.catalog;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@Transactional(readOnly = true, timeout = 8)
class CatalogService {
    private static final int PAGE_SIZE = 12;
    private final CatalogRepository repository;

    CatalogService(CatalogRepository repository) {
        this.repository = repository;
    }

    CatalogPage browse(String keyword, String category, Integer venue, int page) {
        long offset = (page - 1L) * PAGE_SIZE;
        var rows = repository.findPublishedPage(keyword, category, venue, PAGE_SIZE + 1, offset);
        var events = rows.stream().limit(PAGE_SIZE).map(PublicEvent::from).toList();
        return new CatalogPage(events, page, rows.size() > PAGE_SIZE);
    }

    Optional<PublicEvent> detail(int id) {
        return repository.findPublishedEvent(id).map(PublicEvent::from);
    }

    record CatalogPage(List<PublicEvent> events, int page, boolean hasNext) {
    }
}
