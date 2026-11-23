package edu.umd.cems.identity;

import java.util.List;

record SessionIdentity(int id, String name, String email, List<String> roles) {}
