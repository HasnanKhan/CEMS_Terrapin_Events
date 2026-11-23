package edu.umd.cems.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "cems.session.enabled", havingValue = "true")
class SessionSecurityConfig {
    @Bean
    @Order(1)
    SecurityFilterChain sessionServiceSecurity(HttpSecurity http) throws Exception {
        return http
                .securityMatcher("/internal/session/resolve")
                .csrf(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(access -> access.requestMatchers(HttpMethod.POST, "/internal/session/resolve")
                        .permitAll().anyRequest().denyAll())
                .build();
    }
}
