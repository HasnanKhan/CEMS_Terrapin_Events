package edu.umd.cems.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.regex.Pattern;

@RestController
@ConditionalOnProperty(name = "cems.session.enabled", havingValue = "true")
class SessionController {
    private static final Pattern HEX_DIGEST = Pattern.compile("[0-9a-f]{64}");
    private final SessionRepository repository;
    private final byte[] bearer;

    SessionController(SessionRepository repository, @Value("${cems.session.service-token}") String token) {
        if (!HEX_DIGEST.matcher(token).matches()) {
            throw new IllegalArgumentException("Configure a 64-character hexadecimal Spring session service token");
        }
        this.repository = repository;
        bearer = ("Bearer " + token).getBytes(StandardCharsets.US_ASCII);
    }

    @PostMapping("/internal/session/resolve")
    ResponseEntity<SessionIdentity> resolve(@RequestHeader(value = "Authorization", required = false) String authorization,
                                            @RequestHeader(value = "X-CEMS-Session-Hash", required = false) String hash) {
        if (authorization == null || !MessageDigest.isEqual(bearer, authorization.getBytes(StandardCharsets.UTF_8))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (hash == null || !HEX_DIGEST.matcher(hash).matches()) {
            return ResponseEntity.badRequest().build();
        }
        try {
            var session = repository.resolve(hash);
            return session == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(session);
        } catch (DataAccessException unavailable) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }
}
