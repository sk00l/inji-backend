package io.mosip.mimoto.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.mosip.mimoto.dto.mimoto.*;
import org.junit.Test;
import static org.junit.Assert.*;

public class OpenId4VciFinalWireTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    public void finalRequestUsesConfigurationIdAndProofArray() throws Exception {
        var request = VCCredentialRequest.builder().format("ldp_vc")
                .credentialConfigurationId("Identity")
                .proof(VCCredentialRequestProof.builder().proofType("jwt").jwt("signed-proof").build()).build();
        var json = mapper.readTree(mapper.writeValueAsString(request.toRequestBody()));
        assertEquals("Identity", json.path("credential_configuration_id").asText());
        assertEquals("signed-proof", json.path("proofs").path("jwt").get(0).asText());
        assertFalse(json.has("format"));
        assertFalse(json.has("proof"));
    }

    @Test
    public void legacyRequestRetainsItsExistingShape() throws Exception {
        var request = VCCredentialRequest.builder().format("ldp_vc")
                .proof(VCCredentialRequestProof.builder().proofType("jwt").jwt("signed-proof").build()).build();
        var json = mapper.readTree(mapper.writeValueAsString(request.toRequestBody()));
        assertEquals("ldp_vc", json.path("format").asText());
        assertEquals("signed-proof", json.path("proof").path("jwt").asText());
        assertFalse(json.has("credentialConfigurationId"));
        assertFalse(json.has("proofs"));
    }

    @Test
    public void finalResponseUnwrapsCredentialWithoutChangingLegacyResponse() throws Exception {
        var modern = mapper.readValue("{\"credentials\":[{\"credential\":{\"id\":\"example\"}}]}",
                VerifiableCredentialResponse.class);
        var legacy = mapper.readValue("{\"credential\":{\"id\":\"example\"}}",
                VerifiableCredentialResponse.class);
        assertEquals(legacy.getCredential(), modern.getCredential());
    }
}
