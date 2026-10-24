package io.mosip.mimoto.dto.mimoto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VerifiableCredentialResponse {

    @Valid
    @NotNull
    private Object credential;

    @JsonProperty("credentials")
    public void readCredentials(List<Map<String, Object>> credentials) {
        if (credential == null && credentials != null && !credentials.isEmpty()) {
            credential = credentials.getFirst().get("credential");
        }
    }
}
