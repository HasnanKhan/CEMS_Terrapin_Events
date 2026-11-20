package edu.umd.cems.catalog;

import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api")
class CatalogController {
    private static final Set<String> CATEGORIES = Set.of(
            "", "Academic", "Arts & Culture", "Community", "Sports & Recreation", "Technology", "Other");
    private static final Set<String> FILTERS = Set.of("q", "category", "venue", "page");

    private final CatalogService catalog;

    CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/events")
    ResponseEntity<CatalogService.CatalogPage> browse(
            @RequestParam(name = "q", defaultValue = "") String keyword,
            @RequestParam(defaultValue = "") String category,
            @RequestParam(required = false) Integer venue,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam MultiValueMap<String, String> parameters
    ) {
        String search = keyword.strip();
        boolean invalidParameters = parameters.entrySet().stream()
                .anyMatch(entry -> !FILTERS.contains(entry.getKey()) || entry.getValue().size() != 1);
        if (invalidParameters || search.length() > 100 || search.indexOf('\0') >= 0
                || !CATEGORIES.contains(category) || (venue != null && venue < 1) || page < 1) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(catalog.browse(search, category, venue, page));
    }

    @GetMapping("/events/{id:[0-9]+}")
    ResponseEntity<PublicEvent> detail(@PathVariable int id) {
        return ResponseEntity.of(catalog.detail(id));
    }

    @GetMapping("/venues")
    ResponseEntity<List<CatalogService.PublicVenue>> venues() {
        return ResponseEntity.ok(catalog.venues());
    }

    @ExceptionHandler({CannotCreateTransactionException.class, DataAccessResourceFailureException.class,
            QueryTimeoutException.class})
    ResponseEntity<Void> dataUnavailable() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
}
