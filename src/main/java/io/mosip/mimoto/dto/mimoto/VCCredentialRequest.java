package io.mosip.mimoto.dto.mimoto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.Map;
import java.util.List;
import lombok.Builder;
import lombok.Data;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;


@Data
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class VCCredentialRequest {

    @NotBlank
    private String format;

    @Valid
    @NotNull
    private VCCredentialRequestProof proof;

    @JsonProperty("credential_definition")
    @Valid
    @NotNull
    private VCCredentialDefinition credentialDefinition;

    private String vct;

    @JsonIgnore
    private String credentialConfigurationId;

    public Object toRequestBody() {
        if (credentialConfigurationId == null) {
            return this;
        }
        return Map.of("credential_configuration_id", credentialConfigurationId,
                "proofs", Map.of("jwt", List.of(proof.getJwt())));
    }
}
