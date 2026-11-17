using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace AuthFunctionApp;

public record TokenRequest(string? Password);

public class TokenFunction(ILogger<TokenFunction> logger, IConfiguration config)
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    [Function("Token")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Function, "post", Route = "token")] HttpRequest req)
    {
        var expectedPassword = config["AUTH_PASSWORD"];
        var secret = config["JWT_SECRET"];
        if (string.IsNullOrEmpty(expectedPassword) || string.IsNullOrEmpty(secret) || Encoding.UTF8.GetByteCount(secret) < 32)
        {
            logger.LogError("AUTH_PASSWORD or JWT_SECRET is missing, or JWT_SECRET is shorter than 32 bytes.");
            return new StatusCodeResult(StatusCodes.Status500InternalServerError);
        }

        TokenRequest? body;
        try
        {
            body = await JsonSerializer.DeserializeAsync<TokenRequest>(req.Body, JsonOptions);
        }
        catch (JsonException)
        {
            return new BadRequestObjectResult(new { error = "Invalid JSON body." });
        }

        if (string.IsNullOrEmpty(body?.Password))
        {
            return new BadRequestObjectResult(new { error = "Password is required." });
        }

        if (!PasswordMatches(body.Password, expectedPassword))
        {
            logger.LogWarning("Invalid password attempt.");
            return new UnauthorizedObjectResult(new { error = "Invalid password." });
        }

        var expiryMinutes = int.TryParse(config["JWT_EXPIRY_MINUTES"], out var m) && m > 0 ? m : 60;
        var expires = DateTime.UtcNow.AddMinutes(expiryMinutes);

        var token = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = config["JWT_ISSUER"] ?? "auth-function-app",
            Audience = config["JWT_AUDIENCE"] ?? "static-web-app",
            Claims = new Dictionary<string, object> { ["sub"] = "web-user" },
            IssuedAt = DateTime.UtcNow,
            Expires = expires,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)), SecurityAlgorithms.HmacSha256)
        });

        return new OkObjectResult(new { token, expiresAt = expires });
    }

    // Hash both values so the comparison is constant-time regardless of input length.
    private static bool PasswordMatches(string provided, string expected) =>
        CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(provided)),
            SHA256.HashData(Encoding.UTF8.GetBytes(expected)));
}
