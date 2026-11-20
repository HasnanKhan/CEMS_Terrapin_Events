package edu.umd.cems;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

@SpringBootTest(webEnvironment = RANDOM_PORT)
class CatalogDatabaseSecurityTest {
    @Autowired
    private JdbcTemplate db;

    @Test
    void restrictsTheCatalogLoginToPublishedRowsAndPublicColumns() {
        assertThat(db.queryForList(
                "select id from cems_catalog.published_events where id between 820013 and 820016 order by id",
                Integer.class)).containsExactly(820013, 820016);
        assertThat(db.queryForList("select name from cems_catalog.venues order by name", String.class))
                .contains("Catalog fixture hall");
        for (String query : new String[]{
                "select id from public.events where false",
                "select id from public.accounts where false",
                "select account_id from public.registrations where false",
                "select id from public.registrations where false",
                "select id from public.venues where false",
                "select token_hash from public.sessions where false",
                "select id from public.audit_entries where false",
                "update cems_catalog.venues set name = name where false"
        }) {
            assertThatThrownBy(() -> db.execute(query)).rootCause()
                    .isInstanceOfSatisfying(SQLException.class, sql -> assertThat(sql.getSQLState()).isEqualTo("42501"));
        }
        assertThat(db.queryForObject("select has_schema_privilege('cems_catalog', 'CREATE')", Boolean.class))
                .isFalse();
    }
}
