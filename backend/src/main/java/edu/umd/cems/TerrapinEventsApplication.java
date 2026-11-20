package edu.umd.cems;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class TerrapinEventsApplication {
    public static void main(String[] args) {
        SpringApplication.run(TerrapinEventsApplication.class, args);
    }
}
