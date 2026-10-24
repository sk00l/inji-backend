package io.mosip.mimoto.dto.mimoto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@AllArgsConstructor
public class CredentialIssuerConfiguration {
    private String nonceEndpoint;

    public CredentialIssuerConfiguration(String issuer, List<String> servers, String endpoint,
            Map<String, CredentialsSupportedResponse> configurations, AuthorizationServerWellKnownResponse authServer) {
        this.credentialIssuer = issuer;
        this.authorizationServers = servers;
        this.credentialEndPoint = endpoint;
        this.credentialConfigurationsSupported = configurations;
        this.authorizationServerWellKnownResponse = authServer;
    }
    private String credentialIssuer;

    private List<String> authorizationServers;

    private String credentialEndPoint;

    private Map<String, CredentialsSupportedResponse> credentialConfigurationsSupported;

    @JsonIgnoreProperties({"token_endpoint"})
    private AuthorizationServerWellKnownResponse authorizationServerWellKnownResponse;
}
