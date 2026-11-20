package edu.umd.cems.catalog;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

@Entity
@Immutable
@Table(name = "events")
class CatalogEvent {
    @Id
    private Integer id;

    protected CatalogEvent() {
    }
}
