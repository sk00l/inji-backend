package io.mosip.mimoto.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.mosip.mimoto.dto.mimoto.CredentialsSupportedResponse;
import org.junit.Test;
import static org.junit.Assert.*;

public class CredentialsSupportedMetadataTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    public void readsNestedDisplayWithoutWeakeningLegacyResponse() throws Exception {
        var response = mapper.readValue("""
            {"credential_metadata":{"display":[{"name":"Identity","locale":"en"}],"claims":[]}}
            """, CredentialsSupportedResponse.class);
        assertEquals("Identity", response.getDisplay().getFirst().getName());
        var serialized = mapper.readTree(mapper.writeValueAsString(response));
        assertEquals("Identity", serialized.path("display").get(0).path("name").asText());
        assertFalse(serialized.has("credential_metadata"));
    }

    @Test
    public void retainsLegacyDisplayWhenBothFormatsArePresent() throws Exception {
        var response = mapper.readValue("""
            {"display":[{"name":"Legacy","locale":"en"}],
             "credential_metadata":{"display":[{"name":"Nested","locale":"en"}]}}
            """, CredentialsSupportedResponse.class);
        assertEquals("Legacy", response.getDisplay().getFirst().getName());
    }

    @Test
    public void missingDisplayRemainsMissingForValidation() throws Exception {
        var response = mapper.readValue("{\"credential_metadata\":{\"claims\":[]}}",
                CredentialsSupportedResponse.class);
        assertNull(response.getDisplay());
    }
}
