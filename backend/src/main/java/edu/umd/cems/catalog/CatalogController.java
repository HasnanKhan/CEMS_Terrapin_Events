package edu.umd.cems.catalog;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;

@RestController
@RequestMapping("/api/events")
class CatalogController {
    private static final Set<String> CATEGORIES = Set.of(
            "", "Academic", "Arts & Culture", "Community", "Sports & Recreation", "Technology", "Other");

    private final CatalogService catalog;

    CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping
    ResponseEntity<CatalogService.CatalogPage> browse(
            @RequestParam(name = "q", defaultValue = "") String keyword,
            @RequestParam(defaultValue = "") String category,
            @RequestParam(required = false) Integer venue,
            @RequestParam(defaultValue = "1") int page
    ) {
        String search = keyword.strip();
        if (search.length() > 100 || !CATEGORIES.contains(category) || (venue != null && venue < 1) || page < 1) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(catalog.browse(search, category, venue, page));
    }

    @GetMapping("/{id:[0-9]+}")
    ResponseEntity<PublicEvent> detail(@PathVariable int id) {
        return ResponseEntity.of(catalog.detail(id));
    }
}
