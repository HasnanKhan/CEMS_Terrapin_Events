package edu.umd.cems.identity;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
@ConditionalOnProperty(name = "cems.session.enabled", havingValue = "true")
class SessionRepository {
    private final HikariDataSource identityPool;
    private final JdbcTemplate db;

    SessionRepository(@Value("${cems.session.db-url}") String url,
                      @Value("${cems.session.db-user}") String user,
                      @Value("${cems.session.db-password}") String password) {
        if (!url.startsWith("jdbc:postgresql://") || !"terrapin_identity".equals(user) || password.isBlank()) {
            throw new IllegalArgumentException("Configure the separate Spring identity database connection");
        }
        var config = new HikariConfig();
        config.setPoolName("cems-identity");
        config.setJdbcUrl(url);
        config.setUsername(user);
        config.setPassword(password);
        config.setInitializationFailTimeout(-1);
        config.setConnectionTimeout(2_000);
        config.setValidationTimeout(1_000);
        config.setMinimumIdle(0);
        config.setMaximumPoolSize(2);
        config.addDataSourceProperty("connectTimeout", 3);
        config.addDataSourceProperty("socketTimeout", 5);
        identityPool = new HikariDataSource(config);
        db = new JdbcTemplate(identityPool);
        db.setQueryTimeout(2);
    }

    SessionIdentity resolve(String hash) {
        return db.query("select id, name, email, roles from cems_identity.resolve_session(?)",
                (row, index) -> new SessionIdentity(row.getInt("id"), row.getString("name"),
                        row.getString("email"), List.of((String[]) row.getArray("roles").getArray())), hash)
                .stream().findFirst().orElse(null);
    }

    @PreDestroy
    void close() {
        identityPool.close();
    }
}
